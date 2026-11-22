// Rubric-based judge: one lesson, one metric, one call. Each metric has its own scale and a description for
// every level; the judge writes its evidence first, then picks the highest level the lesson fully meets.
//
// Six metrics, from the pairwise-v2 form (prompts.js) minus accuracy and study_from, with bugs renamed technical
// (all 2026-11-16). Every metric is scored 1–7, with every level described so no level is a default "fine".
// Seven points gives more room than five to separate the top systems, which the earlier 5-point absolute form
// scored identically.
//   technical is severity-anchored: the judge lists every problem with a severity first, and the level follows
//   from that list, so the score can be checked against the list.
//
// Call layout (for Gemini implicit caching): the system prompt, intro and video are identical for every
// metric of a lesson; only the final text part (the rubric) changes. Keep SYSTEM free of per-metric text.

const SYSTEM = `You are scoring short educational lessons for a research study that compares lesson-generation \
systems. Each request gives you one lesson and one rubric. Score the lesson on that rubric only. Other rubrics \
cover the other aspects, so keep your overall impression of the lesson out of it.

About the lessons: they come from different systems and formats. Some are videos; some are screen recordings of an \
interactive lesson that was played through automatically. In those recordings, quiz answers were picked by an \
automated player and short pauses while it "decides" are expected. Judge the lesson, not which answer the player \
picked or those pauses. Do not reward or penalize a lesson for being a recording versus a video, or for its length \
unless the rubric asks about length.

Some lessons have sound (narration, sometimes music) and some are silent. Watch and listen: judge both what is on \
screen and what is said. Do not reward or penalize a lesson just for having sound or not; judge what it actually \
delivers, through whatever it uses.

How to score:
1. Watch the whole lesson.
2. Write your observations for this rubric, with timestamps (m:ss).
3. Pick the HIGHEST level whose description the lesson fully meets. If it meets most of a level but misses part of \
it, it gets the level below.
4. Scores are absolute: compare the lesson with the level descriptions, not with other lessons you imagine. Use the \
whole scale. The top level is for lessons that fully meet its description, not for "good enough".`;

const LENS = {
  student: 'Perspective: a university student in the target audience who has the prerequisites for this topic but '
    + 'has not been taught this idea before. Judge by what that student would experience.',
};

// levels: [lo, hi, description], lowest first. hi === lo for a single level; a band covers lo..hi.
const RUBRIC = [
  {
    key: 'overall', name: 'Overall', lens: 'student', min: 1, max: 7,
    question: 'How good is this lesson overall, as a way for a newcomer to learn this topic?',
    judge: 'Your overall judgement as a learner: how well you would understand the topic afterwards, weighing how clear, '
      + 'correct, well-made, engaging and usable the lesson is. Serious errors and anything that stops the lesson '
      + 'working weigh heavily.',
    ignore: 'Length by itself, and whether it is a video or a recording.',
    levels: [
      [1, 1, 'Fails to teach the topic: wrong at its core, mostly off-topic, or so broken or confusing that a student would learn little.'],
      [2, 2, 'Weak: significant problems in several areas (missing steps, serious errors, hard to follow); a student would learn only fragments.'],
      [3, 3, 'Mixed: teaches parts of the topic, but with a significant problem in one area (a key step missing, a serious error, or hard to follow for long stretches).'],
      [4, 4, 'Competent: covers the core idea correctly and can be followed, but has clear weaknesses (thin explanation, weak visuals, passive, or uneven).'],
      [5, 5, 'Good: teaches the core idea well; a few noticeable weaknesses that do not get much in the way of understanding.'],
      [6, 6, 'Strong: clear, correct and well made, with one or two minor weaknesses. A student would come away understanding the core idea.'],
      [7, 7, 'Exceptional, a lesson you would hold up as a model: excellent on every count that matters for learning this topic, with nothing significant to fix.'],
    ],
  },
  {
    key: 'visuals', name: 'Visuals', lens: 'student', min: 1, max: 7,
    question: 'How good are the visuals at showing this concept?',
    judge: 'Whether the graphics are clear and well made, show the actual objects, quantities and relationships of the '
      + 'concept (not decoration), change as the explanation moves on, and vary where variety helps. Legibility of '
      + 'text, labels and formulas; uncluttered layout.',
    ignore: 'Visual style on its own (dark or light theme, 3D versus 2D). Whether the content is correct. '
      + 'Technical problems such as overlapping or cut-off text and elements that fail to load (scored under technical problems): judge '
      + 'the visuals as designed.',
    levels: [
      [1, 1, 'Visuals are mostly absent, decorative or unrelated to the concept; the lesson is essentially text on screen.'],
      [2, 2, 'Some relevant visuals, but generic, cluttered or text-heavy; the key concept itself is not shown visually.'],
      [3, 3, 'Clean, readable visuals that depict the main objects of the concept, but mostly static or repetitive; they illustrate the text rather than explain.'],
      [4, 4, 'Clean, readable visuals of the main objects that change for some steps: they explain parts of the idea but only illustrate others.'],
      [5, 5, 'Clear, well-made visuals that show the concept\'s key objects and relationships and change as the explanation proceeds, with a few weaknesses (a cluttered scene, a missed chance to show something, an uneven section).'],
      [6, 6, 'Clear, well-made visuals that show the concept\'s key objects and relationships and change as the explanation proceeds; one minor weakness at most.'],
      [7, 7, 'The visuals carry the explanation: a student could follow much of the idea from the visuals alone, and they are crisp and consistent throughout.'],
    ],
  },
  {
    key: 'clarity', name: 'Clarity', lens: 'student', min: 1, max: 7,
    question: 'How clear is the explanation?',
    judge: 'Ideas come in a sensible order and the screen builds up step by step: each new element follows from the '
      + 'last, terms and symbols are introduced before they are used, on-screen text and narration match what is shown, and new '
      + 'information arrives at a pace a newcomer can keep up with.',
    ignore: 'Visual polish, how engaging it is, how much ground it covers, and whether it is correct.',
    levels: [
      [1, 1, 'Disordered, or assumes what it should teach; a newcomer would be lost from early on.'],
      [2, 2, 'The main idea is there, but key steps are skipped or used before they are explained, or the screen often shows too much at once.'],
      [3, 3, 'Can be followed with effort or a rewind; one or two real jumps or unexplained symbols.'],
      [4, 4, 'A sensible order that can be followed; a few small gaps or rushed steps that need a moment\'s thought.'],
      [5, 5, 'Logical and step by step; one small gap or briefly rushed step.'],
      [6, 6, 'Logical and step by step throughout: each new element follows from the last, with no gap a newcomer would trip on.'],
      [7, 7, 'Every step is motivated and builds on the last, nothing is used before it is introduced, and a newcomer could reconstruct the argument afterwards.'],
    ],
  },
  {
    key: 'technical', name: 'Technical problems', lens: 'student', min: 1, max: 7, list: 'issues',
    question: 'Does the lesson render and work as its author intended?',
    judge: 'A technical problem is in HOW the lesson is delivered: what the author meant is clear, but the screen, the '
      + 'sound or a control fails to deliver it. List every one you can see, by kind. LAYOUT: text or graphics that overlap, are cut off or run off '
      + 'the screen; a label drawn away from the thing it names. RENDERING: raw code or markup shown instead of content '
      + '(unrendered LaTeX, HTML tags), placeholder values ("undefined", "NaN", "[object Object]"), missing images or '
      + 'blank panels. INTERACTION: the player types into an input and nothing appears, clicks a button and nothing '
      + 'happens, or a quiz or step will not advance. Count one only when you can see the attempt (cursor, click or '
      + 'typed text) and no response. PLAYBACK: animations that freeze, stutter, jump or play out of order, or on-screen '
      + 'text that changes before the matching visual. AUDIO: narration out of sync with what is on screen, cut off '
      + 'mid-sentence, overlapping itself, garbled, or much too quiet or loud. Give each a severity. BLOCKING: the learner cannot go on, or '
      + 'cannot see content they need. MAJOR: content is there but hard to read or use. MINOR: cosmetic; content still '
      + 'readable and usable. Then the level follows from your list.',
    ignore: 'Content errors: anything that would still be wrong if it rendered and worked perfectly (a wrong formula, '
      + 'number, claim, figure or answer key) is not a technical problem and is not scored here. Design choices and '
      + 'style, including a plain or sparse look. The automated player\'s pauses or which answers it picked. A lesson '
      + 'having no sound at all (a design choice, not a fault).',
    levels: [
      [1, 1, 'A blocking problem the lesson does not recover from (an input that will not take typing, a button or quiz that will not advance, a blank screen), or problems that make much of the lesson unusable.'],
      [2, 2, 'A blocking problem the lesson recovers from (a control that fails and then works, a blank panel that loads later), or major problems throughout.'],
      [3, 3, 'Several major problems.'],
      [4, 4, 'One major problem (an unreadable overlap, a cut-off formula, raw code or "undefined" where content should be), or many minor ones.'],
      [5, 5, 'Several minor glitches; content stays readable and usable.'],
      [6, 6, 'One or two minor glitches; content stays readable and usable (a slight overlap, a brief flicker, a small misalignment).'],
      [7, 7, 'No visible technical problems: everything renders, loads and responds as intended.'],
    ],
  },
  {
    key: 'engagement', name: 'Engagement', lens: 'student', min: 1, max: 7,
    question: 'How engaging is the lesson?',
    judge: 'An opening that makes the student want to keep going (a question, puzzle or stake), and a lesson that holds '
      + 'attention to the end: momentum, variety, moments of insight. Padding and repetition count against it.',
    ignore: 'Correctness, and length by itself.',
    levels: [
      [1, 1, 'Dull throughout; reads like slides; a student would stop watching.'],
      [2, 2, 'A flat opening and long stretches of static or repetitive content.'],
      [3, 3, 'An opening that states the topic but gives no pull; attention holds only in parts, with several flat or repetitive stretches.'],
      [4, 4, 'A clear opening with some pull; holds attention, with some flat stretches.'],
      [5, 5, 'An opening that poses a question or stake, and a lesson that moves at a good pace with variety; a few lulls.'],
      [6, 6, 'An opening that poses a real question or stake, good pace and variety throughout, and at least one moment of insight; brief lulls only.'],
      [7, 7, 'An opening that creates real curiosity which the lesson pays off, with momentum and moments of insight throughout.'],
    ],
  },
  {
    key: 'active_learning', name: 'Active learning', lens: 'student', min: 1, max: 7,
    question: 'How much does the lesson make the learner think and do?',
    judge: 'What the lesson asks of the learner: questions that ask them to predict, explain or apply rather than '
      + 'recall or click; hands-on exploration that lets them discover the idea; feedback that responds to their answer; '
      + 'checks placed at the key steps. A video can score above 1 only through what it asks of the viewer.',
    ignore: 'How many interactions there are: judge what they ask of the learner. Which answers the automated player '
      + 'picked. Interactivity that is only navigation (next buttons, scrolling).',
    levels: [
      [1, 1, 'Entirely passive: nothing is asked of the learner.'],
      [2, 2, 'Only rhetorical questions, "pause and think" prompts with no follow-up, or click-to-continue.'],
      [3, 3, 'Some genuine checks, all recall or recognition (e.g. multiple choice on a fact just stated), with right/wrong feedback.'],
      [4, 4, 'Mostly recall checks with right/wrong feedback, plus at least one question that asks the learner to predict, explain or apply.'],
      [5, 5, 'At some key steps the learner predicts, explains or applies, or explores hands-on, and the feedback addresses their answer.'],
      [6, 6, 'At most key steps the learner predicts, explains or applies, or explores hands-on, and the feedback addresses their answer.'],
      [7, 7, 'The learner does the key reasoning: predicting, applying or exploring at the main steps, with feedback that explains why for their specific answer, and checks placed where misconceptions arise.'],
    ],
  },
];

const levelLabel = ([lo, hi]) => (lo === hi ? `${lo}` : `${lo}–${hi}`);

const LISTS = {
  issues: { type: 'array', description: 'Every visible technical problem, in lesson order; empty if none.', items: { type: 'object', properties: {
    timestamp: { type: 'string', description: 'm:ss' },
    description: { type: 'string', description: 'What is broken, and how you can tell.' },
    severity: { type: 'string', enum: ['minor', 'major', 'blocking'] },
  }, required: ['timestamp', 'description', 'severity'] } },
};

function schema(item) {
  const props = {
    evidence: { type: 'string', description: 'Observations from the lesson relevant to this rubric only, with timestamps (m:ss). Write this first.' },
  };
  if (item.list) props[item.list] = LISTS[item.list];
  props.score_reason = { type: 'string', description: 'Which level the lesson fully meets, and what keeps it from the level above (or "top level" if none).' };
  const values = [];
  for (let v = item.min; v <= item.max; v++) values.push(v);
  props.score = { type: 'integer', enum: values };
  return { type: 'object', properties: props, required: Object.keys(props) };
}

function prompt(item) {
  const lines = [
    LENS[item.lens], '',
    `RUBRIC: ${item.name}`,
    `Question: ${item.question}`, '',
    `What to judge: ${item.judge}`,
    `What to ignore: ${item.ignore}`, '',
    `Levels (score ${item.min} to ${item.max}):`,
    ...item.levels.map((l) => `  ${levelLabel(l)} = ${l[2]}`),
  ];
  if (item.bands) lines.push('', item.bands);
  lines.push('', item.list
    ? `Write your evidence, then the full ${item.list} list, then the level that follows from the list, then the score.`
    : 'Write your evidence first, then say which level the lesson fully meets, then give the score.');
  return lines.join('\n');
}

const intro = (topic) => `Topic of this lesson: "${topic}". The lesson follows.`;

// Human-readable copy of the rubric (RUBRIC.md is generated from this; edit the RUBRIC array, not the .md).
function markdown() {
  const out = ['# Lesson rubric', '', 'Generated from `judge/rubric.js` by `node score.js --rubric`. Edit the code, not this file.', '',
    'Each metric is scored in its own call: one lesson, one rubric. The judge writes evidence first, then picks the',
    'highest level the lesson fully meets.', '',
    '| Metric | Scale | Perspective |', '|---|---|---|',
    ...RUBRIC.map((it) => `| ${it.name} (\`${it.key}\`) | ${it.min}–${it.max} | ${it.lens} |`), ''];
  for (const it of RUBRIC) {
    out.push(`## ${it.name} (\`${it.key}\`, ${it.min}–${it.max})`, '', `**${it.question}**`, '',
      `- **Judge:** ${it.judge}`, `- **Ignore:** ${it.ignore}`, '');
    if (it.bands) out.push(it.bands, '');
    out.push('| Score | Description |', '|---|---|', ...[...it.levels].reverse().map((l) => `| ${levelLabel(l)} | ${l[2]} |`), '');
  }
  return out.join('\n');
}

module.exports = { SYSTEM, LENS, RUBRIC, schema, prompt, intro, markdown };
