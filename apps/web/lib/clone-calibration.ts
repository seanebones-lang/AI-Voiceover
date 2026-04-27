/**
 * Teleprompter-style paragraph for reference recordings.
 * Keep in sync with VOICE_CLONE_CALIBRATION_SCRIPT in services/xtts/main.py.
 */
export const VOICE_CLONE_CALIBRATION_SCRIPT =
  'Hello — this is my voice calibration sample for NextEleven. ' +
  'I am reading numbers clearly: twenty-four, ninety-nine, and the year two thousand twenty-six. ' +
  'Here is a question with a pause — does this still sound natural? ' +
  'I can speak softly, or I can project with more energy! ' +
  'Thanks for listening.'

export const CLONE_RECORDING_CHECKLIST = [
  'Record in a quiet room with one speaker only. Turn off fan/AC noise when possible.',
  'Keep a consistent mic distance (about a hand span) and avoid clipping.',
  'Speak naturally with clear articulation; do not over-act unless that is your target style.',
  'Use dry recordings (no music, compression, noise gate, or reverb).',
] as const

export const CLONE_MULTI_SAMPLE_RECOMMENDATION = {
  bestRange: 'Best: 2-4 samples, 30-120s total.',
  why: 'Multiple clean takes capture more of your cadence and emphasis patterns than one long take.',
  perSample: 'Aim for 15-45s per sample with varied sentence shapes.',
} as const

export const CLONE_SUGGESTED_PARAGRAPHS = [
  {
    id: 'neutral_narration',
    label: 'Neutral narration',
    text:
      'Good morning. Today we are reviewing the quarterly update with a calm, steady delivery. ' +
      'Please listen for clear consonants, natural pauses, and consistent pacing throughout the message.',
  },
  {
    id: 'expressive_contrast',
    label: 'Expressive contrast',
    text:
      'I thought the launch would be simple — but it was not! We had one setback, then two fast wins. ' +
      'Can we adapt quickly, stay focused, and still sound confident under pressure?',
  },
  {
    id: 'numbers_questions_names',
    label: 'Numbers, names, and questions',
    text:
      'On March twenty-third, Ava transferred ninety-four files to Jordan in under twelve minutes. ' +
      'Did Liam confirm ticket four-zero-seven before the noon deadline? If not, who should escalate first?',
  },
] as const
