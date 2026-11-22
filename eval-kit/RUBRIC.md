# Lesson rubric

Generated from `judge/rubric.js` by `node score.js --rubric`. Edit the code, not this file.

Each metric is scored in its own call: one lesson, one rubric. The judge writes evidence first, then picks the
highest level the lesson fully meets.

| Metric | Scale | Perspective |
|---|---|---|
| Overall (`overall`) | 1–7 | student |
| Visuals (`visuals`) | 1–7 | student |
| Clarity (`clarity`) | 1–7 | student |
| Technical problems (`technical`) | 1–7 | student |
| Engagement (`engagement`) | 1–7 | student |
| Active learning (`active_learning`) | 1–7 | student |

## Overall (`overall`, 1–7)

**How good is this lesson overall, as a way for a newcomer to learn this topic?**

- **Judge:** Your overall judgement as a learner: how well you would understand the topic afterwards, weighing how clear, correct, well-made, engaging and usable the lesson is. Serious errors and anything that stops the lesson working weigh heavily.
- **Ignore:** Length by itself, and whether it is a video or a recording.

| Score | Description |
|---|---|
| 7 | Exceptional, a lesson you would hold up as a model: excellent on every count that matters for learning this topic, with nothing significant to fix. |
| 6 | Strong: clear, correct and well made, with one or two minor weaknesses. A student would come away understanding the core idea. |
| 5 | Good: teaches the core idea well; a few noticeable weaknesses that do not get much in the way of understanding. |
| 4 | Competent: covers the core idea correctly and can be followed, but has clear weaknesses (thin explanation, weak visuals, passive, or uneven). |
| 3 | Mixed: teaches parts of the topic, but with a significant problem in one area (a key step missing, a serious error, or hard to follow for long stretches). |
| 2 | Weak: significant problems in several areas (missing steps, serious errors, hard to follow); a student would learn only fragments. |
| 1 | Fails to teach the topic: wrong at its core, mostly off-topic, or so broken or confusing that a student would learn little. |

## Visuals (`visuals`, 1–7)

**How good are the visuals at showing this concept?**

- **Judge:** Whether the graphics are clear and well made, show the actual objects, quantities and relationships of the concept (not decoration), change as the explanation moves on, and vary where variety helps. Legibility of text, labels and formulas; uncluttered layout.
- **Ignore:** Visual style on its own (dark or light theme, 3D versus 2D). Whether the content is correct. Technical problems such as overlapping or cut-off text and elements that fail to load (scored under technical problems): judge the visuals as designed.

| Score | Description |
|---|---|
| 7 | The visuals carry the explanation: a student could follow much of the idea from the visuals alone, and they are crisp and consistent throughout. |
| 6 | Clear, well-made visuals that show the concept's key objects and relationships and change as the explanation proceeds; one minor weakness at most. |
| 5 | Clear, well-made visuals that show the concept's key objects and relationships and change as the explanation proceeds, with a few weaknesses (a cluttered scene, a missed chance to show something, an uneven section). |
| 4 | Clean, readable visuals of the main objects that change for some steps: they explain parts of the idea but only illustrate others. |
| 3 | Clean, readable visuals that depict the main objects of the concept, but mostly static or repetitive; they illustrate the text rather than explain. |
| 2 | Some relevant visuals, but generic, cluttered or text-heavy; the key concept itself is not shown visually. |
| 1 | Visuals are mostly absent, decorative or unrelated to the concept; the lesson is essentially text on screen. |

## Clarity (`clarity`, 1–7)

**How clear is the explanation?**

- **Judge:** Ideas come in a sensible order and the screen builds up step by step: each new element follows from the last, terms and symbols are introduced before they are used, on-screen text and narration match what is shown, and new information arrives at a pace a newcomer can keep up with.
- **Ignore:** Visual polish, how engaging it is, how much ground it covers, and whether it is correct.

| Score | Description |
|---|---|
| 7 | Every step is motivated and builds on the last, nothing is used before it is introduced, and a newcomer could reconstruct the argument afterwards. |
| 6 | Logical and step by step throughout: each new element follows from the last, with no gap a newcomer would trip on. |
| 5 | Logical and step by step; one small gap or briefly rushed step. |
| 4 | A sensible order that can be followed; a few small gaps or rushed steps that need a moment's thought. |
| 3 | Can be followed with effort or a rewind; one or two real jumps or unexplained symbols. |
| 2 | The main idea is there, but key steps are skipped or used before they are explained, or the screen often shows too much at once. |
| 1 | Disordered, or assumes what it should teach; a newcomer would be lost from early on. |

## Technical problems (`technical`, 1–7)

**Does the lesson render and work as its author intended?**

- **Judge:** A technical problem is in HOW the lesson is delivered: what the author meant is clear, but the screen, the sound or a control fails to deliver it. List every one you can see, by kind. LAYOUT: text or graphics that overlap, are cut off or run off the screen; a label drawn away from the thing it names. RENDERING: raw code or markup shown instead of content (unrendered LaTeX, HTML tags), placeholder values ("undefined", "NaN", "[object Object]"), missing images or blank panels. INTERACTION: the player types into an input and nothing appears, clicks a button and nothing happens, or a quiz or step will not advance. Count one only when you can see the attempt (cursor, click or typed text) and no response. PLAYBACK: animations that freeze, stutter, jump or play out of order, or on-screen text that changes before the matching visual. AUDIO: narration out of sync with what is on screen, cut off mid-sentence, overlapping itself, garbled, or much too quiet or loud. Give each a severity. BLOCKING: the learner cannot go on, or cannot see content they need. MAJOR: content is there but hard to read or use. MINOR: cosmetic; content still readable and usable. Then the level follows from your list.
- **Ignore:** Content errors: anything that would still be wrong if it rendered and worked perfectly (a wrong formula, number, claim, figure or answer key) is not a technical problem and is not scored here. Design choices and style, including a plain or sparse look. The automated player's pauses or which answers it picked. A lesson having no sound at all (a design choice, not a fault).

| Score | Description |
|---|---|
| 7 | No visible technical problems: everything renders, loads and responds as intended. |
| 6 | One or two minor glitches; content stays readable and usable (a slight overlap, a brief flicker, a small misalignment). |
| 5 | Several minor glitches; content stays readable and usable. |
| 4 | One major problem (an unreadable overlap, a cut-off formula, raw code or "undefined" where content should be), or many minor ones. |
| 3 | Several major problems. |
| 2 | A blocking problem the lesson recovers from (a control that fails and then works, a blank panel that loads later), or major problems throughout. |
| 1 | A blocking problem the lesson does not recover from (an input that will not take typing, a button or quiz that will not advance, a blank screen), or problems that make much of the lesson unusable. |

## Engagement (`engagement`, 1–7)

**How engaging is the lesson?**

- **Judge:** An opening that makes the student want to keep going (a question, puzzle or stake), and a lesson that holds attention to the end: momentum, variety, moments of insight. Padding and repetition count against it.
- **Ignore:** Correctness, and length by itself.

| Score | Description |
|---|---|
| 7 | An opening that creates real curiosity which the lesson pays off, with momentum and moments of insight throughout. |
| 6 | An opening that poses a real question or stake, good pace and variety throughout, and at least one moment of insight; brief lulls only. |
| 5 | An opening that poses a question or stake, and a lesson that moves at a good pace with variety; a few lulls. |
| 4 | A clear opening with some pull; holds attention, with some flat stretches. |
| 3 | An opening that states the topic but gives no pull; attention holds only in parts, with several flat or repetitive stretches. |
| 2 | A flat opening and long stretches of static or repetitive content. |
| 1 | Dull throughout; reads like slides; a student would stop watching. |

## Active learning (`active_learning`, 1–7)

**How much does the lesson make the learner think and do?**

- **Judge:** What the lesson asks of the learner: questions that ask them to predict, explain or apply rather than recall or click; hands-on exploration that lets them discover the idea; feedback that responds to their answer; checks placed at the key steps. A video can score above 1 only through what it asks of the viewer.
- **Ignore:** How many interactions there are: judge what they ask of the learner. Which answers the automated player picked. Interactivity that is only navigation (next buttons, scrolling).

| Score | Description |
|---|---|
| 7 | The learner does the key reasoning: predicting, applying or exploring at the main steps, with feedback that explains why for their specific answer, and checks placed where misconceptions arise. |
| 6 | At most key steps the learner predicts, explains or applies, or explores hands-on, and the feedback addresses their answer. |
| 5 | At some key steps the learner predicts, explains or applies, or explores hands-on, and the feedback addresses their answer. |
| 4 | Mostly recall checks with right/wrong feedback, plus at least one question that asks the learner to predict, explain or apply. |
| 3 | Some genuine checks, all recall or recognition (e.g. multiple choice on a fact just stated), with right/wrong feedback. |
| 2 | Only rhetorical questions, "pause and think" prompts with no follow-up, or click-to-continue. |
| 1 | Entirely passive: nothing is asked of the learner. |
