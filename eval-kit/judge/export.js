// Flatten judge results into CSVs for analysis (re-runnable; reads whatever results exist).
//   node export.js  ->  results/absolute-form.csv  one row per video × question
//                       results/pairwise-form.csv  one row per pair order × question (winner resolved to a system name)
//                       results/pairwise-v2-form.csv  same, revised form; ties have winner/loser 'tie'
//                       results/rubric-scores.csv  rubric (score.js): one row per lesson × metric × sample
//                       results/rubric-summary.csv rubric: mean / sd / range per method × metric
//                       results/usage.csv          one row per call: tokens and when it ran
// Every result JSON (with the judge's reason for each answer) stays in results/<mode>-form/.
const fs = require('fs');
const path = require('path');
const P = require('./prompts');

const R = path.join(__dirname, 'results');
const csv = (rows) => rows.map((r) => r.map((v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(',')).join('\n') + '\n';
const load = (mode) => {
  const dir = path.join(R, mode === 'pairwise-v2' ? (process.env.V2_DIR || 'pairwise-v2-high') : `${mode}-form`);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({ f, ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) })) : [];
};
const q = Object.fromEntries([...P.ABSOLUTE, ...P.PAIRWISE].map((it) => [it.key, it.question]));
const q2 = Object.fromEntries(P.PAIRWISE_V2.map((it) => [it.key, it.question]));

const abs = load('absolute'), pw = load('pairwise'), pw2 = load('pairwise-v2');
const absRows = [['topic', 'system', 'sample', 'question_key', 'question', 'answer', 'reason', 'model']];
for (const r of abs) for (const [k, v] of Object.entries(r.result)) absRows.push([r.topic, r.system, r.sample, k, q[k], v.answer, v.reason, r.model]);
const pairRows = (results, questions) => {
  const rows = [['topic', 'A', 'B', 'sample', 'question_key', 'question', 'answer', 'winner', 'loser', 'reason', 'model']];
  for (const r of results) for (const [k, v] of Object.entries(r.result)) {
    const tie = v.answer === P.TIE;
    const win = tie ? 'tie' : v.answer === 'A' ? r.A : r.B, lose = tie ? 'tie' : v.answer === 'A' ? r.B : r.A;
    rows.push([r.topic, r.A, r.B, r.sample, k, questions[k], v.answer, win, lose, v.reason, r.model]);
  }
  return rows;
};
const pwRows = pairRows(pw, q), pw2Rows = pairRows(pw2, q2);
const useRows = [['mode', 'file', 'at', 'model', 'prompt_tokens', 'cached_tokens', 'output_tokens', 'thinking_tokens']];
for (const [mode, rs] of [['absolute', abs], ['pairwise', pw], ['pairwise-v2', pw2]]) for (const r of rs) {
  const u = r.usage || {};
  useRows.push([mode, r.f, r.at, r.model, u.promptTokenCount, u.cachedContentTokenCount || 0, u.candidatesTokenCount, u.thoughtsTokenCount || 0]);
}
// Rubric (score.js): one row per lesson × metric × sample, plus a per-method summary.
// Base results come from results/<RUBRIC_DIR, default rubric>/. Results in each RUBRIC_OVERRIDE folder (comma-separated,
// default rubric-interaction; set it to '' for none) replace the base result for the same file name, i.e. the same
// topic × method × metric × sample. The 'source' column says which folder each row came from.
const loadDir = (name) => { const d = path.join(R, name); return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => ({ f, source: name, ...JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')) })) : []; };
const byFile = new Map(loadDir(process.env.RUBRIC_DIR || 'rubric').map((r) => [r.f, r]));
const overrides = (process.env.RUBRIC_OVERRIDE ?? 'rubric-interaction').split(',').filter(Boolean);
let replaced = 0;
for (const o of overrides) for (const r of loadDir(o)) { if (byFile.has(r.f)) replaced++; byFile.set(r.f, r); }
const rub = [...byFile.values()].sort((a, b) => a.f.localeCompare(b.f, undefined, { numeric: true }));
const rubRows = [['topic', 'system', 'metric', 'sample', 'score', 'min', 'max', 'score_norm', 'n_listed', 'n_worst', 'score_reason', 'evidence', 'listed', 'model', 'source', 'interaction_log']];
const worst = { issues: 'blocking' };
for (const r of rub) {
  const x = r.result, [lo, hi] = r.scale;
  const key = Object.keys(worst).find((k) => Array.isArray(x[k]));
  const items = key ? x[key] : null;
  rubRows.push([r.topic, r.system, r.metric, r.sample, x.score, lo, hi, ((x.score - lo) / (hi - lo)).toFixed(3),
    items ? items.length : '', items ? items.filter((e) => e.severity === worst[key]).length : '',
    x.score_reason, x.evidence, items ? items.map((e) => `[${e.timestamp} ${e.severity}] ${e.description}`).join(' | ') : '', r.model, r.source, r.interactionLog ? 'yes' : 'no']);
}
const agg = {};
for (const r of rub) {
  const a = (agg[`${r.system}|${r.metric}`] ||= { system: r.system, metric: r.metric, max: r.scale[1], s: [] });
  a.s.push(r.result.score);
}
const sumRows = [['system', 'metric', 'max', 'n', 'mean', 'sd', 'min', 'max_seen']];
for (const a of Object.values(agg).sort((p, q) => p.metric.localeCompare(q.metric) || p.system.localeCompare(q.system))) {
  const n = a.s.length, m = a.s.reduce((t, v) => t + v, 0) / n;
  const sd = n > 1 ? Math.sqrt(a.s.reduce((t, v) => t + (v - m) ** 2, 0) / (n - 1)) : 0;
  sumRows.push([a.system, a.metric, a.max, n, m.toFixed(2), sd.toFixed(2), Math.min(...a.s), Math.max(...a.s)]);
}
for (const r of rub) {
  const u = r.usage || {};
  useRows.push(['rubric', r.f, r.at, r.model, u.promptTokenCount, u.cachedContentTokenCount || 0, u.candidatesTokenCount, u.thoughtsTokenCount || 0]);
}
fs.writeFileSync(path.join(R, 'rubric-scores.csv'), csv(rubRows));
fs.writeFileSync(path.join(R, 'rubric-summary.csv'), csv(sumRows));
console.log(`rubric: ${rub.length} results (${replaced} replaced from ${overrides.join(', ') || 'no override'}) -> rubric-scores.csv, rubric-summary.csv`);

fs.writeFileSync(path.join(R, 'absolute-form.csv'), csv(absRows));
fs.writeFileSync(path.join(R, 'pairwise-form.csv'), csv(pwRows));
fs.writeFileSync(path.join(R, 'pairwise-v2-form.csv'), csv(pw2Rows));
fs.writeFileSync(path.join(R, 'usage.csv'), csv(useRows));
console.log(`absolute: ${abs.length} calls, ${absRows.length - 1} answers · pairwise: ${pw.length} calls, ${pwRows.length - 1} answers · pairwise-v2: ${pw2.length} calls, ${pw2Rows.length - 1} answers`);
