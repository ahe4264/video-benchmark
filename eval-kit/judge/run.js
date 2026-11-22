// Run the judge. Each call answers a whole human form in one go.
//   node run.js absolute [--topics p1,p2] [--items visual_quality,errors] [--samples N] [--concurrency N] [--limit N] [--dry]
//   node run.js pairwise [--topics p1,p2] [--items overall,accuracy]      [--samples N] [--concurrency N] [--limit N] [--dry]
//   node run.js pairwise-v2 [same options]   revised comparison form (prompts.PAIRWISE_V2), ties allowed
//   --out NAME     results folder results/NAME (default <mode>-form), e.g. to keep runs on re-cut videos apart
//   --media low|medium|high   Gemini media resolution for the videos (default: the API's own default)
//   --systems a,b  only these systems (e.g. --systems lessonstudio,claude-code-alone for a pilot on one pair)
//
// absolute: every lesson on its own, one call with the single-video form.
// pairwise: every pair of systems within a topic, in BOTH orders (A/B swapped), one call with the comparison form.
// pairwise-v2: the same pairs, with the revised form.
// --items asks only some questions of the form; --limit N runs only the first N pending jobs;
// --dry prints one job's prompt without calling the API.
//   --with NAME    only pairs that include NAME (e.g. --with lessonagent)
// Videos: the silent copies in ../videos/pN/<method>.mp4 (built by make-kit.js). A file there means the lesson exists.
// Results: judge/results/<mode>-form/<topic>__<systems>__s<k>.json. Existing results are skipped, so a rerun
// resumes. Lessons are blinded: the model sees "LESSON A/B" and an anonymous upload name.
const fs = require('fs');
const path = require('path');
const P = require('./prompts');

const ROOT = path.join(__dirname, '..');
const BUNDLE = ROOT; // manifest.csv
const MUTED = path.join(ROOT, 'videos');
const SYSTEMS = ['lessonagent', 'coding-agent', 'notebooklm', 'paper2video', 'manimator', 'code2video', 'pptagent'];
const video = (p, s) => path.join(MUTED, p, `${s}.mp4`);

const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i < 0 ? def : argv[i + 1]; };
const samples = +opt('samples', 1);
const concurrency = +opt('concurrency', 4);
const limit = +opt('limit', Infinity);
const dry = argv.includes('--dry');
const FORMS = {
  absolute: { items: P.ABSOLUTE, prompt: P.absolutePrompt, schema: P.absoluteSchema },
  pairwise: { items: P.PAIRWISE, prompt: P.pairwisePrompt, schema: P.pairwiseSchema },
  'pairwise-v2': { items: P.PAIRWISE_V2, prompt: P.pairwiseV2Prompt, schema: P.pairwiseV2Schema },
};
if (!FORMS[mode]) { console.error(`usage: node run.js ${Object.keys(FORMS).join('|')} [...]`); process.exit(1); }

let ITEMS = FORMS[mode].items;
if (opt('items')) { const want = opt('items').split(','); ITEMS = ITEMS.filter((it) => want.includes(it.key)); }
const prompt = FORMS[mode].prompt(ITEMS);
const schema = FORMS[mode].schema(ITEMS);
const systems = opt('systems') ? opt('systems').split(',') : SYSTEMS;

const rows = fs.readFileSync(path.join(BUNDLE, 'manifest.csv'), 'utf8').trim().split(/\r?\n/).map((r) => r.split(','));
const header = rows.shift();
const col = (row, name) => row[header.indexOf(name)];
const byId = Object.fromEntries(rows.map((r) => [col(r, 'id'), r]));
let topics = rows.map((r) => col(r, 'id'));
if (opt('topics')) topics = opt('topics').split(',');

const jobs = [];
for (const p of topics) {
  const have = systems.filter((s) => fs.existsSync(video(p, s)));
  const missing = systems.filter((s) => !have.includes(s));
  if (missing.length) console.log(`${p}: missing ${missing.join(', ')}`);
  const groups = [];
  if (mode === 'absolute') for (const s of have) groups.push([s]);
  else for (let i = 0; i < have.length; i++) for (let j = i + 1; j < have.length; j++) {
    if (opt('with') && ![have[i], have[j]].includes(opt('with'))) continue;
    groups.push([have[i], have[j]], [have[j], have[i]]);
  }
  for (let k = 1; k <= samples; k++) for (const sys of groups) jobs.push({ p, k, sys, file: `${p}__${sys.join('__vs__')}__s${k}.json` });
}
const outDir = path.join(__dirname, 'results', opt('out', `${mode}-form`));
const mediaResolution = opt('media') ? `MEDIA_RESOLUTION_${opt('media').toUpperCase()}` : undefined;
fs.mkdirSync(outDir, { recursive: true });
const todo = jobs.filter((j) => !fs.existsSync(path.join(outDir, j.file))).slice(0, dry ? 1 : limit);
console.log(`${mode}: ${jobs.length} calls, ${jobs.length - jobs.filter((j) => !fs.existsSync(path.join(outDir, j.file))).length} already done, running ${todo.length}${dry ? ' (dry run)' : ''}`);

async function runJob(job, G) {
  const topic = col(byId[job.p], 'topic');
  const parts = [{ text: P.intro(topic, job.sys.length) }];
  const labels = job.sys.length === 1 ? ['LESSON'] : ['LESSON A', 'LESSON B'];
  for (let i = 0; i < job.sys.length; i++) {
    parts.push({ text: `=== ${labels[i]} ===` });
    if (!dry) parts.push(G.videoPart(await G.uploadVideo(video(job.p, job.sys[i]))));
    else parts.push({ text: `[video: ${path.relative(ROOT, video(job.p, job.sys[i]))}]` });
  }
  parts.push({ text: prompt });
  if (dry) {
    console.log(`\n----- ${job.file} -----\n[system]\n${P.SYSTEM}\n\n[user]`);
    for (const x of parts) console.log(x.text);
    console.log(`\n[schema]\n${JSON.stringify(schema, null, 1)}`);
    return;
  }
  const { json, usage, model } = await G.generateJSON({ parts, schema, system: P.SYSTEM, tag: job.file, mediaResolution });
  const record = {
    topic: job.p, sample: job.k, model, at: new Date().toISOString(),
    ...(mode === 'absolute' ? { system: job.sys[0] } : { A: job.sys[0], B: job.sys[1] }),
    ...(mediaResolution && { mediaResolution }), result: json, usage,
  };
  fs.writeFileSync(path.join(outDir, job.file), JSON.stringify(record, null, 2));
  console.log(`done ${job.file} (${usage.promptTokenCount} in)`);
}

(async () => {
  const G = dry ? null : require('./gemini');
  // Upload every needed video first, so parallel jobs don't race to upload the same file.
  if (!dry) for (const f of new Set(todo.flatMap((j) => j.sys.map((s) => video(j.p, s))))) await G.uploadVideo(f);
  const queue = [...todo];
  let failed = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const job = queue.shift();
      try { await runJob(job, G); } catch (e) { failed++; console.error(`FAILED ${job.file}: ${e.message || e}`); }
    }
  }));
  if (failed) { console.error(`${failed} jobs failed — rerun to retry them`); process.exit(1); }
})();
