// Interaction log for recorded interactive lessons (EduVisAgent): what the automated student did, when, and whether
// the screen responded. The recordings show no cursor, so the judge cannot otherwise tell a dead control from a pause.
//   node interaction.js [p1,p2,...]       (default: every lesson with a recorder log)
// In:  ../../eduvisagent_static/pN.mp4 + logs/pN.json (actions and page errors, seconds from recording start)
// Out: ../interaction/pN__eduvisagent.json (per-action measurements) and .txt (the log the judge reads),
//      ../interaction/summary.csv (per-lesson counts).
// Response = largest share of pixels that changed (vs the frame just before the action) at any point until the next
// action or 4 s later, on a 640x360 greyscale copy. Below CHANGED it counts as "no visible change".
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ff = require(path.join(__dirname, '..', '..', 'recorder', 'node_modules', 'ffmpeg-static'));

const SRC = path.join(__dirname, '..', '..', 'eduvisagent_static');
const OUT = path.join(__dirname, '..', 'interaction');
const W = 640, H = 360, FPS = 4, WINDOW = 4;
const PIX_DIFF = +(process.env.PIX_DIFF || 6), CHANGED = +(process.env.CHANGED_PX || 30) / (W * H); // a pixel counts if its grey level moves > PIX_DIFF; a response needs >= CHANGED_PX such pixels
const ERR_WINDOW = 4;
fs.mkdirSync(OUT, { recursive: true });

const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const lessons = (process.argv[2] ? process.argv[2].split(',') : fs.readdirSync(path.join(SRC, 'logs')).map((f) => f.replace('.json', '')))
  .filter((p) => fs.existsSync(path.join(SRC, `${p}.mp4`)));

function describe(a) {
  const l = JSON.stringify(a.label || '');
  switch (a.kind) {
    case 'button': return `clicked button ${l}`;
    case 'text': return `typed a written answer into the box ${l}`;
    case 'number': return `typed a number into ${l}`;
    case 'select': return `picked an option in a drop-down`;
    case 'radio': return `selected choice ${l}`;
    case 'check': return `ticked a checkbox ${a.label && a.label !== 'on' ? l : ''}`.trim();
    case 'range': return `dragged a slider ${l === '""' ? '' : `(starting at ${l}) `}through its whole range`;
    case 'close-popup': return `closed a pop-up (${a.label})`;
    default: return `${a.kind} ${l}`;
  }
}

// Stream the video once as greyscale frames. Each probe {t, end} gets the largest share of pixels that differ from the
// last frame before t, over frames in (t, end]. Probes must be sorted by t.
function measure(p, probes) {
  return new Promise((resolve, reject) => {
    const frameSize = W * H;
    const res = probes.map(() => 0);
    const before = probes.map(() => null);
    let idx = 0, buf = Buffer.alloc(0), next = 0, prev = null;
    const proc = spawn(ff, ['-v', 'error', '-i', path.join(SRC, `${p}.mp4`), '-vf', `fps=${FPS},scale=${W}:${H},format=gray`, '-f', 'rawvideo', 'pipe:1']);
    proc.stdout.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= frameSize) {
        const frame = buf.subarray(0, frameSize); buf = buf.subarray(frameSize);
        const t = idx / FPS; idx++;
        for (let i = next; i < probes.length && probes[i].t < t + 1 / FPS; i++) if (!before[i] && t >= probes[i].t - 1 / FPS) before[i] = prev || Buffer.from(frame);
        for (let i = next; i < probes.length && probes[i].t < t; i++) {
          if (!before[i] || t > probes[i].end) continue;
          let n = 0; const b = before[i];
          for (let k = 0; k < frameSize; k += 2) if (Math.abs(frame[k] - b[k]) > PIX_DIFF) n++;
          res[i] = Math.max(res[i], (2 * n) / frameSize);
        }
        while (next < probes.length && t > probes[next].end + WINDOW) { before[next] = null; next++; }
        prev = Buffer.from(frame);
      }
    });
    proc.on('error', reject);
    proc.on('close', (code) => (code ? reject(new Error(`ffmpeg exited ${code} on ${p}`)) : resolve(res)));
  });
}

// The video starts a little after the recorder's clock (varies per lesson, ~0-3 s). Measure every action at each
// candidate offset in one pass and keep the offset where the fewest inputs look unanswered.
const OFFSETS = [-3, -2.5, -2, -1.5, -1, -0.5, 0];
async function calibrated(p, actions) {
  const probes = [];
  for (const o of OFFSETS) actions.forEach((a, i) => probes.push({ o, i, t: a.t + o,
    end: Math.min(a.t + o + WINDOW, i + 1 < actions.length ? actions[i + 1].t + o : Infinity) }));
  probes.sort((x, y) => x.t - y.t);
  const res = await measure(p, probes);
  const by = Object.fromEntries(OFFSETS.map((o) => [o, actions.map(() => 0)]));
  probes.forEach((q, k) => { by[q.o][q.i] = res[k]; });
  const dead = (o) => actions.filter((a, i) => a.kind !== 'close-popup' && by[o][i] < CHANGED).length;
  const best = OFFSETS.reduce((m, o) => (dead(o) < dead(m) || (dead(o) === dead(m) && Math.abs(o + 1.5) < Math.abs(m + 1.5)) ? o : m));
  return { offset: best, change: by[best], deadByOffset: Object.fromEntries(OFFSETS.map((o) => [o, dead(o)])) };
}

(async () => {
  const rows = [];
  await Promise.all([0, 1, 2, 3].map(async (w) => {
    for (let j = w; j < lessons.length; j += 4) {
      const p = lessons[j];
      const log = JSON.parse(fs.readFileSync(path.join(SRC, 'logs', `${p}.json`), 'utf8'));
      const actions = log.actions;
      const { offset, change, deadByOffset } = await calibrated(p, actions);
      for (const a of actions) a.t = +(a.t + offset).toFixed(1);
      for (const e of log.errors) e.t = +(e.t + offset).toFixed(1);
      const firstAction = actions.length ? actions[0].t : Infinity;
      const loadErrors = log.errors.filter((e) => e.t < firstAction && !e.msg.startsWith('recorder:'));
      const items = actions.map((a, i) => {
        const end = i + 1 < actions.length ? Math.min(actions[i + 1].t, a.t + ERR_WINDOW) : a.t + ERR_WINDOW;
        const errs = log.errors.filter((e) => e.t >= a.t && e.t < end && !e.msg.startsWith('recorder:')).map((e) => e.msg);
        return { t: a.t, part: a.part + 1, kind: a.kind, label: a.label, change: +change[i].toFixed(4), responded: change[i] >= CHANGED,
          errors: [...new Set(errs)], failed: a.failed || null };
      });
      const graded = items.filter((x) => x.kind !== 'close-popup');
      const dead = graded.filter((x) => !x.responded);
      const withErr = graded.filter((x) => x.errors.length);
      const summary = { lesson: p, offset, actions: graded.length, noVisibleChange: dead.length, withPageError: withErr.length,
        deadOrError: graded.filter((x) => !x.responded || x.errors.length).length, loadErrors: loadErrors.length,
        recorderCouldNotUse: graded.filter((x) => x.failed).length };
      fs.writeFileSync(path.join(OUT, `${p}__eduvisagent.json`), JSON.stringify({ ...summary, deadByOffset, loadErrorMessages: loadErrors.map((e) => e.msg), items }, null, 1));

      const lines = [];
      lines.push(`Interaction log: ${graded.length} inputs by an automated student. The mouse cursor is NOT visible in the recording, so this log says when and where input was given.`);
      lines.push(`Each line: time in the video, part (tab) of the lesson, what was done, and what happened. "no visible change" = the screen did not change within a few seconds; "page error" = the lesson's code crashed while handling the input.`);
      if (loadErrors.length) lines.push(`While the page loaded (before any input), its code crashed ${loadErrors.length}x: ${[...new Set(loadErrors.map((e) => e.msg))].map((m) => `"${m}"`).join('; ')}. Whatever that code was meant to do may be missing or inert.`);
      lines.push(`Summary: ${dead.length} of ${graded.length} inputs produced no visible change; ${withErr.length} raised a page error.`);
      lines.push('');
      for (const x of items) {
        const what = describe(x);
        const outcome = [];
        if (x.failed) outcome.push('the control could not be operated');
        if (x.errors.length) outcome.push(`page error: ${x.errors.map((m) => `"${m.slice(0, 90)}"`).join(', ')}`);
        outcome.push(x.kind === 'close-popup' ? 'pop-up closed' : x.responded ? 'screen changed' : 'no visible change');
        lines.push(`${mmss(x.t)}  part ${x.part}  ${what} -> ${outcome.join('; ')}`);
      }
      fs.writeFileSync(path.join(OUT, `${p}__eduvisagent.txt`), lines.join('\n') + '\n');
      rows.push(summary);
      console.log(`${p}: ${graded.length} inputs, ${dead.length} no visible change, ${withErr.length} with page error, ${loadErrors.length} load errors`);
    }
  }));
  rows.sort((a, b) => +a.lesson.slice(1) - +b.lesson.slice(1));
  const cols = Object.keys(rows[0]);
  const old = fs.existsSync(path.join(OUT, 'summary.csv')) ? fs.readFileSync(path.join(OUT, 'summary.csv'), 'utf8').trim().split('\n').slice(1) : [];
  const keep = old.filter((l) => !rows.some((r) => l.startsWith(r.lesson + ',')));
  const all = [...keep, ...rows.map((r) => cols.map((c) => r[c]).join(','))].sort((a, b) => +a.split(',')[0].slice(1) - +b.split(',')[0].slice(1));
  fs.writeFileSync(path.join(OUT, 'summary.csv'), [cols.join(','), ...all].join('\n') + '\n');
})().catch((e) => { console.error(e); process.exit(1); });
