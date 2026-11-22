// Rubric-based judge: score every lesson on every metric of rubric.js, one Gemini call per (lesson, metric).
//   node score.js [--topics p1,p2] [--systems a,b] [--metrics overall,technical] [--samples N] [--concurrency N]
//                 [--limit N] [--out NAME] [--media low|medium|high] [--model ID] [--dry]
//   node score.js --rubric          print the rubric as Markdown (regenerates ../RUBRIC.md)
//
// Videos: ../videos/pN/<method>.mp4 (a file there means the lesson exists). Topics: ../manifest.csv.
// Results: results/<out, default rubric>/<topic>__<method>__<metric>__s<k>.json. Existing results are skipped,
// so a rerun resumes and retries failures. Lessons are blinded: the upload name is a hash, and the prompt never
// names the method.
// Defaults: model gemini-3.1-pro-preview, temperature 0.2, media high, concurrency 4.
// --concurrency counts lessons in flight (= API calls in flight): each lesson's metrics run one after another.
// Each lesson gets an explicit context cache (system prompt + intro + video, media resolution set on the video
// part), so its metric calls pay the cached rate for the video; --no-cache sends everything with each call.
// --interaction: for the technical metric, add the lesson's interaction log (../interaction/<topic>__<method>.txt, from
// interaction.js) when one exists. Interactive recordings show no cursor, so the log tells the judge when input was given.
// --dry prints the prompt and schema for each selected metric without calling the API (works with no videos).
const fs = require('fs');
const path = require('path');
const R = require('./rubric');

const argv = process.argv.slice(2);
if (argv.includes('--rubric')) { process.stdout.write(R.markdown()); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const VIDEOS = path.join(ROOT, 'videos');
// Methods = every <method>.mp4 name found under videos/pN/ (override with --systems).
const SYSTEMS = [...new Set((fs.existsSync(VIDEOS) ? fs.readdirSync(VIDEOS) : [])
  .flatMap((p) => { try { return fs.readdirSync(path.join(VIDEOS, p)); } catch { return []; } })
  .filter((f) => f.endsWith('.mp4')).map((f) => f.slice(0, -4)))].sort();
const video = (p, s) => path.join(VIDEOS, p, `${s}.mp4`);

const opt = (name, def) => { const i = argv.indexOf('--' + name); return i < 0 ? def : argv[i + 1]; };
const list = (name, def) => (opt(name) ? opt(name).split(',') : def);
const samples = +opt('samples', 1);
const concurrency = +opt('concurrency', 4);
const limit = +opt('limit', Infinity);
const dry = argv.includes('--dry');
const useCache = !argv.includes('--no-cache');
const withInteraction = argv.includes('--interaction');
const INTERACTION = path.join(ROOT, 'interaction');
const interactionLog = (p, s) => { const f = path.join(INTERACTION, `${p}__${s}.txt`); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; };
const INTERACTION_NOTE = 'This lesson is interactive and was recorded while an automated student used it. The mouse cursor is not visible in '
  + 'the video, so the log below records every input: when, where, and what the recorder measured afterwards. Treat each entry as the '
  + 'attempt that the INTERACTION kind asks you to see. For entries marked "no visible change" or "page error", look at that moment in '
  + 'the video and judge from what you see: if the lesson gives no response the student would notice (no feedback, nothing moves or '
  + 'advances, an answer is not checked), count an INTERACTION problem and give it a severity like any other. If the lesson visibly '
  + 'responds normally, a page error alone is not a problem. Crashes while the page loaded count only where you can see what they '
  + 'break. Inputs that do nothing because they are only for the student’s own notes or ratings are not problems.';
const model = opt('model', 'gemini-3.1-pro-preview');
const mediaResolution = `MEDIA_RESOLUTION_${opt('media', 'high').toUpperCase()}`;
const systems = list('systems', SYSTEMS);
const metricKeys = list('metrics', R.RUBRIC.map((it) => it.key));
const unknown = metricKeys.filter((k) => !R.RUBRIC.some((it) => it.key === k));
if (unknown.length) { console.error(`unknown metric(s): ${unknown.join(', ')}; known: ${R.RUBRIC.map((it) => it.key).join(', ')}`); process.exit(1); }
const METRICS = R.RUBRIC.filter((it) => metricKeys.includes(it.key));

const rows = fs.readFileSync(path.join(ROOT, 'manifest.csv'), 'utf8').trim().split(/\r?\n/).map((r) => r.split(','));
const header = rows.shift();
const col = (row, name) => row[header.indexOf(name)];
const topicOf = Object.fromEntries(rows.map((r) => [col(r, 'id'), col(r, 'topic')]));
const topics = list('topics', rows.map((r) => col(r, 'id')));

if (dry) {
  const p = topics[0];
  console.log(`[system]\n${R.SYSTEM}\n\nmodel ${model}, ${mediaResolution}, temperature 0.2`);
  for (const it of METRICS) {
    console.log(`\n=============== ${it.key} ===============\n[user]\n${R.intro(topicOf[p])}\n=== LESSON ===\n[video: videos/${p}/<method>.mp4]\n${R.prompt(it)}`);
    console.log(`\n[schema]\n${JSON.stringify(R.schema(it))}`);
  }
}

// One group per lesson (topic × method × sample), holding that lesson's pending metric jobs.
const outDir = path.join(__dirname, 'results', opt('out', 'rubric'));
const groups = [];
let total = 0, done = 0;
for (const p of topics) {
  const have = systems.filter((s) => fs.existsSync(video(p, s)));
  const missing = systems.filter((s) => !have.includes(s));
  if (missing.length && !dry) console.log(`${p}: no video for ${missing.join(', ')}`);
  for (let k = 1; k <= samples; k++) for (const s of have) {
    const jobs = [];
    for (const it of METRICS) {
      const file = `${p}__${s}__${it.key}__s${k}.json`;
      total++;
      if (fs.existsSync(path.join(outDir, file))) done++; else jobs.push({ p, s, k, item: it, file });
    }
    if (jobs.length) groups.push(jobs);
  }
}
// --limit counts calls; trim whole groups from the end.
let budget = limit;
const todo = [];
for (const g of groups) { if (budget <= 0) break; todo.push(g.slice(0, budget)); budget -= Math.min(budget, g.length); }
const nTodo = todo.reduce((n, g) => n + g.length, 0);
console.log(`\nrubric: ${total} calls (${METRICS.length} metrics), ${done} already done, ${dry ? 'would run' : 'running'} ${nTodo}`);
if (dry) process.exit(0);

// The shared prefix of every call for one lesson: intro + the video. With a cache, it lives in the cache (with the
// system prompt and the video's media resolution); without one, it is sent with each call.
const lessonParts = (G, job, file, perPart) => [
  { text: R.intro(topicOf[job.p]) },
  { text: '=== LESSON ===' },
  perPart ? { ...G.videoPart(file), mediaResolution: { level: mediaResolution } } : G.videoPart(file),
];

async function runJob(job, G, file, cache) {
  const log = withInteraction && job.item.key === 'technical' ? interactionLog(job.p, job.s) : null;
  const ask = [...(log ? [{ text: `=== INTERACTION LOG ===
${INTERACTION_NOTE}

${log}` }] : []), { text: R.prompt(job.item) }];
  const parts = cache ? ask : [...lessonParts(G, job, file, false), ...ask];
  const t0 = Date.now();
  const { json, usage } = await G.generateJSON({ parts, schema: R.schema(job.item), system: R.SYSTEM, model, tag: job.file, mediaResolution, cachedContent: cache && cache.name });
  if (!Number.isInteger(json.score) || json.score < job.item.min || json.score > job.item.max) throw new Error(`score out of range: ${json.score}`);
  const record = {
    topic: job.p, system: job.s, metric: job.item.key, scale: [job.item.min, job.item.max], sample: job.k,
    model, mediaResolution, explicitCache: !!cache, interactionLog: !!log, at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000),
    result: json, usage,
  };
  fs.writeFileSync(path.join(outDir, job.file), JSON.stringify(record, null, 2));
  console.log(`done ${job.file}: ${json.score}/${job.item.max} (${usage.promptTokenCount} in, ${usage.cachedContentTokenCount || 0} cached, ${record.seconds}s)`);
}

(async () => {
  const G = require('./gemini');
  fs.mkdirSync(outDir, { recursive: true });
  const queue = [...todo];
  let failed = 0, finished = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const group = queue.shift();
      let file;
      try { file = await G.uploadVideo(video(group[0].p, group[0].s)); } catch (e) {
        failed += group.length; console.error(`FAILED upload ${group[0].p}/${group[0].s}: ${e.message || e}`); continue;
      }
      // One explicit cache per lesson (system prompt + intro + video), deleted when its metrics are done. If it can't
      // be made, the lesson runs uncached.
      let cache = null;
      if (useCache && group.length > 1) {
        try {
          cache = await G.createCache({ parts: lessonParts(G, group[0], file, true), system: R.SYSTEM, model, ttlSeconds: 3600, tag: `${group[0].p}-${group[0].s}` });
          console.log(`cache ${group[0].p}/${group[0].s}: ${cache.usageMetadata && cache.usageMetadata.totalTokenCount} tokens`);
        } catch (e) { console.warn(`no cache for ${group[0].p}/${group[0].s} (${String(e.message || e).slice(0, 120)}); running uncached`); }
      }
      try {
        for (const job of group) {
          try { await runJob(job, G, file, cache); } catch (e) { failed++; console.error(`FAILED ${job.file}: ${e.message || e}`); }
          finished++;
        }
      } finally { if (cache) await G.deleteCache(cache.name); }
      console.log(`progress: ${done + finished}/${total} attempted, ${failed} failed`);
    }
  }));
  if (failed) { console.error(`${failed} calls failed; rerun the same command to retry them`); process.exit(1); }
})();
