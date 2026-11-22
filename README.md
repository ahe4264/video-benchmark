# video-benchmark

A benchmark of AI lesson-generation methods. Each method produces a lesson on the same topics (p1–p32), every lesson
is turned into a video, and Gemini 3.1 Pro scores each video against a 1–7 rubric on six dimensions.

**Current state (2026-11-17):** the rubric evaluation is complete for **p1–p20** for all five methods (594 scores).
p21–p32 are not evaluated yet: their topic titles are not in `eval-kit/manifest.csv`.

```
video-benchmark/
├── .env                    GEMINI_API_KEY=...  (secret — never commit or share)
│
├── code2video/             ┐
├── notebooklm/             │  source videos per method, as delivered (pN.mp4; __MACOSX/ is zip debris)
├── paper2video/            │
├── ours_static/            ┘
├── eduvisagent/            EduVisAgent lessons as interactive HTML (pN.html, 26 lessons)
├── eduvisagent_static/     EduVisAgent recorded to video (pN.mp4) + logs/pN.json (every input and page error)
│
├── recorder/               Playwright recorders that turn interactive HTML lessons into MP4
├── eval-kit/               the evaluation: videos the judge sees, rubric, judge code, results   ← main folder
└── judge/                  LEGACY pairwise judge + make-kit.js (built an older eval-kit); not used now
```

## Methods

| Method (name in results) | Lessons | Source | How the video was made |
|---|---|---|---|
| `ours_static` | p1–p20 except p16 (19) | `ours_static/ours_static/pN.mp4` | original video, with audio |
| `code2video` | p1–p32 | `code2video/code2video/pN.mp4` | original video, with audio |
| `notebooklm` | p1–p32 except p30 | `notebooklm/notebooklm/pN.mp4` | original video, with audio |
| `paper2video` | p1–p32 | `paper2video/paper2video/pN.mp4` | original video, with audio |
| `eduvisagent` | 26: p1–p21, p23–p25, p29, p30 | `eduvisagent/pN.html` | recorded by `recorder/record-eduvis.js` (silent, 1920×1080) |

## Pipeline

```
eduvisagent/pN.html ──record-eduvis.js──► eduvisagent_static/pN.mp4 + logs/pN.json
                                                    │                     │
<method>/<method>/pN.mp4 ──copy──┐                  │                     │
                                 ▼                  ▼                     ▼
                       eval-kit/videos/pN/<method>.mp4        eval-kit/judge/interaction.js
                                 │                                        │
                                 ▼                                        ▼
            eval-kit/judge/score.js (Gemini, 1 call per lesson × metric)  eval-kit/interaction/pN__eduvisagent.txt
                                 │                                        │ (fed to the technical metric
                                 ▼                                        │  with --interaction)
          eval-kit/judge/results/rubric/*.json  ◄─────────────────────────┘ results/rubric-interaction/*.json
                                 │
                                 ▼
          eval-kit/judge/export.js ──► results/rubric-scores.csv, rubric-summary.csv
```

### 1. Recording EduVisAgent (`recorder/record-eduvis.js`)

Opens each HTML lesson in headless Chromium and works through it like a student: every part (tab), every screen,
with a dwell time based on the amount of text, then the controls on that screen, best first (text/number inputs
get a typed attempt, then selects, radios, checkboxes, slider sweeps, step buttons, other buttons; up to 12 per
screen). Pop-ups are closed. Budget 20 min per lesson, split across parts; hard stop at 25 min.

```
cd recorder
node record-eduvis.js --concurrency 6 --max-min 20 all      # or: p3 p7 ...
```

Output: `eduvisagent_static/pN.mp4` (H.264, 30 fps, no audio) and `eduvisagent_static/logs/pN.json`
(`actions`: time, part, kind, label; `errors`: JavaScript errors the page threw; `parts`: per-part stats).
An existing `pN.mp4` is skipped, so delete it to re-record. `run.log` is the log of the last full run.
Known issues are in the recorder's notes; the recordings show **no mouse cursor**.

`recorder/record.js` and the other scripts there (`mux.js`, `remux.js`, `finalize.js`, `mute.js`, …) belong to
the earlier benchmark (recording LessonAgent / Coding Agent with narration) and are not part of the current run.

### 2. The evaluation kit (`eval-kit/`)

| Path | What |
|---|---|
| `videos/pN/<method>.mp4` | The exact files the judge sees (copies of the sources above). Currently p1–p20, 99 videos. |
| `manifest.csv` | Topic id, subject and topic title. **Only p1–p20.** The method columns are from the earlier benchmark and are not used. |
| `prompts/pN.txt` + figure | The generation brief and textbook figure for each topic (reference only). |
| `RUBRIC.md` | Readable copy of the rubric, generated from `judge/rubric.js`. |
| `interaction/` | Interaction logs for EduVisAgent (see step 4) and `summary.csv`. |
| `judge/` | The judge code and results (below). |
| `README.md`, `AGENT_PROMPTS.md` | Older docs written for the pairwise judge. The rubric section of `README.md` is current; the rest describes the previous benchmark. |

### 3. Scoring (`eval-kit/judge/score.js`)

Each video is scored on its own, one Gemini call per lesson per metric. Model `gemini-3.1-pro-preview`,
temperature 0.2, media resolution high, JSON-schema output (evidence → listed issues → reason → score).
The judge sees the topic title and the video (with sound when it has sound); it is never told the method.

| Metric | Key | Scale |
|---|---|---|
| Overall | `overall` | 1–7 |
| Visuals | `visuals` | 1–7 |
| Clarity | `clarity` | 1–7 |
| Technical problems | `technical` | 1–7, with a listed issue per problem (minor / major / blocking) |
| Engagement | `engagement` | 1–7 |
| Active learning | `active_learning` | 1–7 |

The rubric text lives in `judge/rubric.js` (the source of truth) and a Claude Doc "Lesson Evaluation Rubric".

```
cd eval-kit/judge
node score.js --topics p1,p2 --concurrency 8                 # all methods found in videos/, all metrics
node score.js --systems eduvisagent --metrics technical --interaction --out rubric-interaction
node score.js --dry                                          # print prompts/schemas, no API calls
node score.js --rubric > ../RUBRIC.md                        # regenerate RUBRIC.md
```

- **Resumable:** an existing result file is skipped, so re-running the same command retries only failures.
- **Caching:** each lesson's video is uploaded once (Files API, kept ~48 h; see `cache/files.json`) and put in an
  explicit context cache shared by that lesson's metric calls, then deleted. `--no-cache` turns this off.
- **Concurrency** counts lessons in flight; 8–15 works, with some rate-limit (429) retries at 15.
- **Cost:** about $0.20–0.50 per short video (all 6 metrics) and about $2–3 per 20-minute EduVisAgent recording.

### 4. Interaction logs (`eval-kit/judge/interaction.js`)

Because the recordings show no cursor, a judge watching the video cannot tell a dead button from a pause.
`interaction.js` reads each recorder log and the video, and for every input measures whether the screen changed
in the next few seconds (greyscale frame difference) and whether the page threw a JavaScript error. The time
offset between log and video (0 to −3 s) is calibrated per lesson.

```
cd eval-kit/judge
node interaction.js            # all lessons with a recorder log; or: node interaction.js p2,p10
```

Output in `eval-kit/interaction/`: `pN__eduvisagent.txt` (the log the judge reads, one line per input, e.g.
`7:38  part 3  clicked button "(B) …" -> page error: "…"; no visible change`), `pN__eduvisagent.json`
(measurements) and `summary.csv` (per lesson: offset, inputs, no visible change, page errors, load errors).

With `score.js --interaction`, the **technical** metric (only) gets this log next to the video, with
instructions to check each flagged moment in the video and count only what a student would notice.
Only EduVisAgent has logs, since the other methods are not interactive. For the paper: *interactive lessons were
judged with an interaction log, since recordings show no cursor; the log only directs the judge's attention, and
every problem must be visible in the video.*

### 5. Results (`eval-kit/judge/results/`)

| Path | What |
|---|---|
| `rubric/<topic>__<method>__<metric>__s1.json` | One file per call: `result` (evidence, issues, score_reason, score), model, media resolution, seconds, token usage. 594 files. |
| `rubric-interaction/…` | EduVisAgent `technical`, p1–p20, re-scored with the interaction log. These **replace** the matching `rubric/` files in the export. |
| `rubric-scores.csv` | One row per lesson × metric: score, normalised score, issue counts, reason, evidence, listed issues, `source` folder, `interaction_log`. |
| `rubric-summary.csv` | Mean / sd / min / max per method × metric. |
| `usage.csv` | Tokens per call. |
| `cachetest/` | Six calls from the caching test (p1 paper2video); not used in the export. |
| `absolute-form.csv`, `pairwise*.csv` | Legacy pairwise exports; empty now. |

```
cd eval-kit/judge
node export.js                                   # rubric/ with rubric-interaction/ swapped in
RUBRIC_OVERRIDE= node export.js                  # original scores only
```

`*.log` files in `eval-kit/judge/` are run logs (pilot, full runs, rescore); `cache/usage.jsonl` logs every API call.

### Results so far (p1–p20, mean score out of 7)

| Method | Overall | Visuals | Clarity | Technical | Engagement | Active learning |
|---|---|---|---|---|---|---|
| ours_static (19) | 5.84 | 6.00 | 5.68 | 5.95 | 4.89 | 5.84 |
| eduvisagent (20) | 5.90 | 5.80 | 5.15 | 3.65* | 4.30 | 5.90 |
| code2video (20) | 5.45 | 5.95 | 5.45 | 4.55 | 4.55 | 3.50 |
| notebooklm (20) | 5.20 | 4.40 | 4.80 | 5.60 | 4.75 | 2.80 |
| paper2video (20) | 2.50 | 2.85 | 2.75 | 5.25 | 2.30 | 2.20 |

\* with the interaction log (4.85 without). Full and current numbers: `eval-kit/judge/results/rubric-summary.csv`.

## Gaps and to-dos

- **p21–p32** need topic titles in `eval-kit/manifest.csv` before they can be scored (drafts were made from the
  videos' title slides), and their videos copied into `eval-kit/videos/`.
- EduVisAgent has no lessons p22, p26–p28, p31, p32; ours_static has no p16 and nothing past p20; notebooklm has no p30.
- Every score is a single sample (`s1`); repeat runs differ by about ±1 on individual lessons.
- JavaScript errors in some EduVisAgent lessons come from the lessons' own code (e.g. p2, p19), not the recorder.
