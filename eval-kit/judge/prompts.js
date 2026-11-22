// Judge prompts: the two forms from the human study, each asked as ONE call with the form's own wording.
//   ABSOLUTE — one lesson, the single-video form (12 questions, same scales and labels raters saw)
//   PAIRWISE — two lessons on the same topic, the comparison form. Raters compared 4 lessons; with 2,
//              "Weakest overall" and "Rank them" follow from "Best overall", so they are left out.
//
// Like the human raters, the judge sees only the topic title and the lesson(s) — not the generation
// brief or the textbook figure. Unlike them, it sees the silent copies (muted/), and is told so.
// The earlier per-item version with detailed rubrics is in backup/prompts.per-item.js.
//   PAIRWISE_V2 — revised comparison form: defined items, "No real difference" allowed, adds active learning.
//                 Not the human form; see the note above it for what changed and why.

const SYSTEM = `You are taking part in a study of short educational lessons, answering the same questionnaire the \
student raters filled in. Answer as a university student in the target audience: you have the prerequisites for \
the topic but have not been taught this idea before.

About the lessons: they come from different systems and formats. Some are videos; some are screen recordings of an \
interactive lesson that was played through automatically — quiz answers in those were picked by an automated \
player, and short pauses while it "decides" are expected. Judge how the lesson teaches, not which answer was picked \
or those pauses. Do not reward or penalize a lesson for being a recording versus a video, or for its length except \
where a question asks about length.

The lessons are shown WITHOUT SOUND: the audio track has been removed from every lesson. Judge only what is on \
screen — visuals, animation, on-screen text, formulas and captions. Do not penalize a lesson for having no audio \
(it is not a technical problem), and do not guess what a narrator might have said.

Watch each lesson in full before answering. For every question, give a short reason with timestamps (m:ss), then \
your answer.`;

// ─────────────────────────── ABSOLUTE (single-video form) ───────────────────────────
// scale: array of [value, label]; value is what is stored. Scale ends are labelled as on the form.
const likert = (lo, hi) => [[1, `1 = ${lo}`], [2, '2'], [3, '3'], [4, '4'], [5, `5 = ${hi}`]];
const ABSOLUTE = [
  { key: 'visual_quality', question: 'Visual quality of the graphics', scale: likert('poor', 'excellent') },
  { key: 'figure_match', question: 'The figure matched the concept being taught', scale: likert('not at all', 'completely') },
  { key: 'errors', question: 'Did you notice anything wrong — a wrong label, a wrong formula, a figure that contradicts the narration?',
    scale: [['nothing_wrong', 'Nothing wrong'], ['minor_slips', 'Minor slips'], ['serious_errors', 'Serious errors'], ['not_sure', 'Not sure']] },
  { key: 'explanation_quality', question: 'Quality of the explanation', scale: likert('poor', 'excellent') },
  { key: 'ease_of_following', question: 'How easy was it to follow?', scale: likert('hard', 'effortless') },
  { key: 'opening_hook', question: 'The opening made me want to keep going', scale: likert('not at all', 'very much') },
  { key: 'engagement', question: 'How engaging was it overall?', scale: likert('dull', 'gripping') },
  { key: 'understanding_gain', question: 'I understood the concept better afterwards', scale: likert('not at all', 'a lot better') },
  { key: 'pacing', question: 'Its length and pacing were',
    scale: [['too_short', 'Too short'], ['a_bit_short', 'A bit short'], ['about_right', 'About right'], ['a_bit_long', 'A bit long'], ['too_long', 'Too long']] },
  { key: 'technical', question: 'Technical problems (stutters, broken animation, audio out of sync, nothing loading)',
    scale: [['none', 'None'], ['minor_glitches', 'Minor glitches'], ['major_problems', 'Major problems']] },
  { key: 'exam_use', question: 'I would use this to study for an exam', scale: likert('never', 'definitely') },
  { key: 'open_ended', question: 'Anything that stood out, good or bad?' },
];

// ─────────────────────────── PAIRWISE (comparison form, 2 lessons) ───────────────────────────
const PAIRWISE = [
  { key: 'overall', question: 'Best overall' },
  { key: 'graphics', question: 'Best graphics' },
  { key: 'opening', question: 'Best opening' },
  { key: 'explanation_clarity', question: 'Clearest explanation' },
  { key: 'engagement', question: 'Most engaging' },
  { key: 'accuracy', question: 'Most accurate — fewest errors' },
  { key: 'study_from', question: 'The one you would actually study from' },
];

// ─────────────────────────── PAIRWISE v2 (revised comparison form) ───────────────────────────
// Changes from PAIRWISE, and why:
//   - "No real difference" is allowed: the absolute form rates the top systems identically, and forcing a pick
//     made the judge break ties on style (dark theme, 3D) and length; on accuracy it often said "both are
//     accurate, but…" and then picked one anyway.
//   - Each item carries a short definition, so the judge rates the property asked about and not surface style.
//   - Merged: graphics + graphical variety + figure match → visuals; clarity + build-up of the board → clarity;
//     opening + engagement → engagement.
//   - New: active_learning. The original form had no question about what a lesson asks the student to do.
//   - New (2026-11-16): bugs — visible breakage (overlapping text, inputs that won't take input…), kept apart
//     from accuracy (content errors). Results made before it was added lack this key; they were moved to
//     results/pairwise-v2-high-before-bugs/ so they get re-run with the full form.
const PAIRWISE_V2 = [
  { key: 'overall', question: 'Best lesson overall', def: 'Your overall judgement as a learner.' },
  { key: 'visuals', question: 'Best visuals',
    def: 'Graphics that are clear and well made, varied where variety helps, and that match the concept being taught. '
      + 'Visual style on its own — dark or light theme, 3D versus 2D — is not a reason.' },
  { key: 'clarity', question: 'Clearest explanation',
    def: 'Ideas come in a sensible order and the screen builds up step by step: each new element follows from the '
      + 'last, and nothing jumps ahead or is left unexplained.' },
  { key: 'accuracy', question: 'Most accurate',
    def: 'Fewer or less serious errors (wrong labels, wrong formulas, figures that contradict the text). If you found '
      + 'no errors in either lesson, answer "No real difference" — more formulas or more rigour is not more accurate.' },
  { key: 'bugs', question: 'Fewest bugs',
    def: 'Fewer or less serious things that are visibly broken or unintended: text or graphics that overlap, are cut '
      + 'off or run off the screen; elements that fail to load, stay blank or glitch; controls that do not work — the '
      + 'player types into an input box and nothing appears, clicks a button and nothing happens, or a quiz will not '
      + 'advance; animations that freeze, jump or play out of order. Weigh each by how much it gets in the learner\'s '
      + 'way. Not bugs: wrong content (that is accuracy), the automated player\'s pauses or which answers it picked, '
      + 'the missing sound, or a style you dislike. If neither lesson shows a visible bug, answer "No real difference".' },
  { key: 'engagement', question: 'Most engaging',
    def: 'An opening that makes you want to keep going, and a lesson that holds your attention to the end.' },
  { key: 'active_learning', question: 'Which lesson made you think and do more?',
    def: 'Questions that ask you to predict, explain or apply rather than just recall or click; hands-on exploration '
      + 'that lets you discover the idea; feedback that responds to your answer; checks placed at the key steps. '
      + 'Judge what the interactions ask of the learner, not how many there are.' },
  { key: 'study_from', question: 'The one you would actually study from', def: 'As a student preparing for an exam.' },
];
const TIE = 'no_difference';

const reason = { type: 'string', description: 'Short reason with timestamps (m:ss). Write this before the answer.' };
const obj = (props) => ({ type: 'object', properties: props, required: Object.keys(props) });

function absoluteSchema(items = ABSOLUTE) {
  const props = {};
  for (const it of items) {
    if (!it.scale) { props[it.key] = obj({ answer: { type: 'string', description: 'Free text, as the student would write it; timestamps welcome.' } }); continue; }
    const values = it.scale.map(([v]) => v);
    props[it.key] = obj({ reason, answer: typeof values[0] === 'number' ? { type: 'integer', enum: values } : { type: 'string', enum: values } });
  }
  return obj(props);
}

function absolutePrompt(items = ABSOLUTE) {
  const lines = ['About this lesson. Answer every question.', ''];
  items.forEach((it, i) => {
    lines.push(`${i + 1}. [${it.key}] ${it.question}`);
    lines.push(it.scale ? `   Options: ${it.scale.map(([v, l]) => (typeof v === 'number' ? l : `${v} = ${l}`)).join(' · ')}` : '   (free text)');
  });
  return lines.join('\n');
}

function pairwiseSchema(items = PAIRWISE) {
  const props = {};
  for (const it of items) props[it.key] = obj({ reason, answer: { type: 'string', enum: ['A', 'B'] } });
  return obj(props);
}

function pairwisePrompt(items = PAIRWISE) {
  return [
    'Now that you have seen them both, compare them. For each question pick A or B — you must pick one.', '',
    ...items.map((it, i) => `${i + 1}. [${it.key}] ${it.question}`),
    '', 'The order the lessons are shown in is random and carries no information.',
  ].join('\n');
}

function pairwiseV2Schema(items = PAIRWISE_V2) {
  const props = {};
  for (const it of items) props[it.key] = obj({ reason, answer: { type: 'string', enum: ['A', 'B', TIE] } });
  return obj(props);
}

function pairwiseV2Prompt(items = PAIRWISE_V2) {
  return [
    `Now that you have seen them both, compare them. For each question answer A, B, or ${TIE} ("No real difference").`, '',
    ...items.flatMap((it, i) => [`${i + 1}. [${it.key}] ${it.question}`, `   ${it.def}`]),
    '',
    `Answer ${TIE} only when you genuinely cannot separate the two lessons on that question — not to hedge. `
      + 'When you pick A or B, say what separates them.',
    'Do not reward or penalize a lesson for its length, and ignore the automated player\'s pauses and which answers it picked.',
    'The order the lessons are shown in is random and carries no information.',
  ].join('\n');
}

const intro = (topic, n) => n === 1
  ? `Topic of this lesson: "${topic}". The lesson follows.`
  : `Topic of both lessons: "${topic}". LESSON A and LESSON B follow.`;

module.exports = {
  SYSTEM, ABSOLUTE, PAIRWISE, PAIRWISE_V2, TIE,
  absoluteSchema, absolutePrompt, pairwiseSchema, pairwisePrompt, pairwiseV2Schema, pairwiseV2Prompt, intro,
};
