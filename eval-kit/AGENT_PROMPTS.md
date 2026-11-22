# Prompts for an agent running the evaluation

Paste these to a coding agent (Claude Code or similar) **one at a time**, opened in the `eval-kit/` folder.
Wait for its report before sending the next one.

- Prompt 0 is a standing brief. Send it first; the later prompts assume it.
- Fill in `<SCOPE>` in Prompt 2. The options are listed there.

---

## Prompt 0: Brief (send first)

```
You are running an LLM-as-judge evaluation of educational lessons. Everything you need is in this folder
(eval-kit/). Read README.md first.

What the evaluation is:
- 20 topics (manifest.csv). Up to seven lesson-generation methods per topic. Each lesson is a silent
  video in videos/pN/<method>.mp4.
- Gemini (gemini-3.1-pro-preview) watches two lessons on the same topic and answers an 8-question
  comparison form (judge/prompts.js, PAIRWISE_V2). The answers are A, B or no_difference, each with a
  reason.
- Every pair is judged in BOTH orders (A/B swapped) to control for position bias.
- run.js skips results that already exist in judge/results/pairwise-v2-high/, so a rerun resumes. Do not
  delete or rename anything there. judge/results/pairwise-v2-high-before-bugs/ holds 24 older results
  from before the `bugs` question existed. Leave it alone and don't mix it into this run.

Rules. These keep all results comparable with each other:
1. Do not edit judge/prompts.js or the model, temperature or media settings. Always pass
   `--out pairwise-v2-high --media high`, and set GEMINI_MODEL=gemini-3.1-pro-preview in .env.
2. Do not modify, re-encode or trim anything in videos/.
3. Keep the judge blind. Never put method names in a prompt or an uploaded file name. gemini.js already
   uploads under a hashed name.
4. Use concurrency 4 (the default). Only raise it if I say so. The API returns 429 errors under load,
   and gemini.js retries them on its own.
5. If something fails in a way that retrying won't fix, stop and tell me. Don't work around it by
   changing the settings above.
6. For long runs, report progress every ~20 minutes: calls done / total, failures, and a realistic ETA.

Reply with a one-paragraph summary of your understanding and anything in the kit that looks wrong or
missing. Don't run anything yet.
```

---

## Prompt 1: Set up and dry run

```
Set up and sanity-check the kit. Do not make any paid API calls yet.

1. Check that .env exists with GEMINI_API_KEY and GEMINI_MODEL=gemini-3.1-pro-preview. If it doesn't,
   copy .env.example and ask me for the key.
2. Run `cd judge && npm install`.
3. Check the videos: there should be 139 files under videos/ that match videos/index.csv. Every file
   should decode, and none should have an audio stream. Use ffprobe/ffmpeg if available; the npm
   package ffmpeg-static works too.
4. Print the job counts for each scope. These should be 828, 590 and 238, with 0 already done:
     node run.js pairwise-v2 --out pairwise-v2-high --media high --dry
     node run.js pairwise-v2 --out pairwise-v2-high --media high --dry --systems lessonagent,coding-agent,notebooklm,paper2video,manimator,code2video
     node run.js pairwise-v2 --out pairwise-v2-high --media high --dry --with lessonagent
5. Show me the one prompt the dry run prints, and confirm it contains no method names.

Report: the check results, the three counts, and any problems.
```

---

## Prompt 2: Pilot (4 paid calls)

```
Run a small pilot before the full run. Scope for this evaluation: <SCOPE>
  (one of: "all"                 -> no extra flag
           "no-pptagent"         -> --systems lessonagent,coding-agent,notebooklm,paper2video,manimator,code2video
           "lessonagent-pairs"   -> --with lessonagent)

1. Run exactly 4 calls:
     node run.js pairwise-v2 --out pairwise-v2-high --media high <scope flag> --topics p2 --limit 4
2. Open the 4 result JSONs and check:
   - each has all 8 questions, each with a reason and an answer
   - the `bugs` reasons point at visible breakage (overlap, cut-off text, unresponsive inputs), not at
     content errors or the player's pauses
   - the reasons cite plausible timestamps (m:ss) within the videos' durations (videos/index.csv)
   - the reasons talk about the lessons' content and don't complain about missing audio
   - mediaResolution is MEDIA_RESOLUTION_HIGH and the model is gemini-3.1-pro-preview
3. Report wall time per call and prompt tokens per call. Also give an estimated total time and token
   count for the full run at this scope.

Stop after reporting. Don't start the full run.
```

---

## Prompt 3: Full run

```
Start the full run at the scope from the pilot:

  cd judge && node run.js pairwise-v2 --out pairwise-v2-high --media high <scope flag> > full-run.log 2>&1

Run it in the background and watch full-run.log. Report every ~20 minutes: done / total, failures, and
ETA. You can count done calls with `ls results/pairwise-v2-high | wc -l`.

- If the process dies (network drop, sleep, crash), re-run the same command. It resumes and retries only
  the missing calls.
- If the log shows the same non-retryable error on many calls (400 errors, auth, quota exhausted), stop
  and tell me.
- When it finishes, re-run the command once more to retry any "FAILED" calls. Repeat until it reports
  "running 0", or until the same few calls keep failing. In that case, list them for me.
```

---

## Prompt 4: Export and check

```
The run is complete. Export and check the results.

1. Run `node export.js` in judge/. It writes results/pairwise-v2-form.csv (one row per call × question)
   and results/usage.csv.
2. Completeness: every expected (topic, A, B) pair is present in both orders, and every call has all 8
   questions. List anything missing.
3. Position bias: for each question, how often do the two orders of the same pair agree, meaning the
   same winner or both no_difference? Also, how often does A win vs B? Flag it if A or B wins much more
   than ~50% of the non-tie answers.
4. Cost: total prompt and output tokens from usage.csv.
```

---

## Prompt 5: Analysis and write-up

```
Analyse results/pairwise-v2-form.csv and write the results up in results/REPORT.md.

For each question (overall, visuals, clarity, accuracy, bugs, engagement, active_learning, study_from):
1. Win/tie/loss table for every pair of methods, pooled over topics and both orders. Report counts,
   and a win rate that counts ties as half.
2. Ranking of methods by win rate against all opponents, ties counted as half. Also fit a Bradley-Terry
   model: fold ties in as half a win to each side, or use a Davidson tie model. Give 95% intervals from
   a bootstrap over topics (resample topics, not individual calls).
3. LessonAgent vs each other method: per-topic outcome, meaning the result of combining both orders
   (win if it wins both, or wins one and ties the other; loss for the mirror case; otherwise split).
   Count the topics each method wins.

Notes to include:
- Code2Video mixes two runs (p1 and p19: Opus 5.5; the other 18: an older run of unconfirmed model), and NotebookLM is missing p19, so flag methods with few
  comparisons.
- PPTAgent's video is its slides at a fixed 10 s each, since the deck has no narration or timing.
- The judge saw every lesson without sound.

Keep the report factual: tables first, then 5–10 bullet points on what stands out. Quote 2–3 judge
reasons that illustrate the main differences, with the file they came from.
```
