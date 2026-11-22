# Lesson evaluation kit (pairwise v2, final lessons)

A self-contained kit for running the Gemini pairwise judge on the final set of lessons: 20 topics, seven
methods. The videos have already been prepared; you only need a Gemini API key and Node 20.12+ (for `process.loadEnvFile`).

## Contents

| Path | What |
|---|---|
| `videos/pN/<method>.mp4` | 139 lessons, all **silent** (the judge is told the sound is removed). |
| `videos/index.csv` | For each video: source file, how it was processed, and duration. |
| `manifest.csv` | Topic id, subject, topic title, and 1/0 for each method that exists. |
| `prompts/` | The generation briefs and textbook figures, for reference only. The judge sees only the topic title and the videos. |
| `judge/` | The judge (`run.js`, `prompts.js`, `gemini.js`, `export.js`). |
| `judge/results/pairwise-v2-high-before-bugs/` | 24 earlier results (LessonAgent vs Coding Agent, both orders, 12 topics), made before the `bugs` question was added. Kept for reference only; the run redoes them with the full form. |
| `AGENT_PROMPTS.md` | Step-by-step instructions to hand to an agent that runs the evaluation. |
| `.env.example` | Copy to `.env` and fill in `GEMINI_API_KEY`. |

## Methods

| Name in kit | Method | Topics | How the video was made |
|---|---|---|---|
| `lessonagent` | LessonAgent (ours, Claude Opus 5) | 20 | Automated screen recording of the interactive lesson, with dead air trimmed |
| `coding-agent` | Coding Agent (Claude Opus 5) | 20 | Same as LessonAgent |
| `notebooklm` | NotebookLM | 19 (not p19) | Original video with the audio removed |
| `paper2video` | Paper2Video (Claude Opus 5.5) | 20 | Original video with the audio removed |
| `manimator` | Manimator (Opus 5 or 5.5, see `index.csv`) | 20 | Original video (already silent) |
| `code2video` | Code2Video | 20 | Original video (already silent). p1 and p19 come from the final bundle (Opus 5.5). The other 18 come from the older `lesson-evaluation` bundle: same briefs, but an earlier run whose model is unconfirmed |
| `pptagent` | PPTAgent (Claude Opus 5.5) | 20 | The deck's slides at 10 s each. The deck has no narration or timing of its own, so this pacing is our convention |

For the recordings, trimming kept the first 1 s of any still stretch longer than 3 s that had no narration, and removed the rest.

## Rubric scoring (`score.js`)

Each lesson is scored on its own against a rubric, one Gemini call per lesson per metric
(`gemini-3.1-pro-preview`, temperature 0.2, media high). The rubric and its scales are in `judge/rubric.js`,
and a readable copy is in `RUBRIC.md`. To regenerate it, run `node -e "require('fs').writeFileSync('../RUBRIC.md', require('./rubric').markdown())"` in `judge/`.

Every metric is scored **1–7**, and every level has a description.

| Metric | Kind |
|---|---|
| `overall`, `visuals`, `clarity`, `engagement`, `active_learning` | described levels |
| `technical` (technical problems) | the judge lists problems with severities first, and the level follows from the list |

```
cd judge && npm install
node score.js --dry                         # prints every metric's prompt and the call count; no API calls
node score.js --topics p1 --limit 6         # pilot: one lesson, all 6 metrics
node score.js                               # full run; resumes if restarted
node export.js                              # -> results/rubric-scores.csv, results/rubric-summary.csv
```

There are 6 calls per video, so 834 calls for 139 videos. Each lesson's metrics run back to back, so the
system prompt and video prefix can hit Gemini's implicit cache. `--concurrency` counts lessons in flight.
Results go to `judge/results/rubric/<topic>__<method>__<metric>__s1.json`.

## Running the pairwise judge

```
cp .env.example .env            # then add GEMINI_API_KEY
cd judge && npm install
node run.js pairwise-v2 --out pairwise-v2-high --media high --dry        # prints the job count and one prompt
node run.js pairwise-v2 --out pairwise-v2-high --media high              # the full run; resumes if restarted
node export.js                                                            # results -> CSVs in judge/results/
```

- Every pair of methods within a topic is judged in **both orders** (A/B swapped).
- Existing results are skipped, so re-running the same command resumes the job and retries anything that failed.

**Scope options:**

| Scope | Flag | Calls | Rough time at concurrency 4 |
|---|---|---|---|
| All 7 methods | (none) | 828 | ~5.5 h |
| Without PPTAgent | `--systems lessonagent,coding-agent,notebooklm,paper2video,manimator,code2video` | 590 | ~4 h |
| Only pairs involving LessonAgent | `--with lessonagent` | 238 | ~1.5–2 h |

Each call is about 185k input tokens with `--media high`.

**Settings** (the same as for the earlier results; keep them fixed for the whole run so all results are comparable):

| Setting | Value |
|---|---|
| Model | `gemini-3.1-pro-preview` |
| Temperature | 0.2 |
| `--media` | `high` |
| Samples | 1 per order |
| Prompt | `prompts.js` unchanged |

## Output

- `judge/results/pairwise-v2-high/<topic>__<A>__vs__<B>__s1.json` contains, for each question, the judge's reason (with timestamps) and its answer: `A`, `B` or `no_difference`.
- `node export.js` flattens these into `judge/results/pairwise-v2-form.csv`, one row per call × question, with the winner and loser resolved to method names. It also writes `usage.csv` with the token counts for each call.

The questions are `overall`, `visuals`, `clarity`, `accuracy`, `bugs`, `engagement`, `active_learning` and `study_from`.
`bugs` covers visible breakage (overlapping or cut-off text, elements that don't load, inputs or buttons that don't
respond, frozen animations), and is kept separate from `accuracy`, which covers content errors.
