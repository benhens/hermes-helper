// Placeholder step data for the B1 page shell. hhcontent is writing the real steps (B3); they
// replace this file. Step 2 carries the accepted round 3 drawing's text so the layout can be judged.

export const PLACEHOLDER_STEPS = [
  { number: 1, title: 'What you want Hermes to do', short: 'Your goal, in your words' },
  {
    number: 2,
    title: 'The brain',
    short: 'What a model is, where it runs',
    heading: 'The brain: what a model is, and where it runs',
    intro:
      'Hermes doesn’t think by itself. It sends your words to a model, the AI that does the thinking. A provider is whoever runs that model.',
    compare: [
      { title: 'On a provider’s servers', text: 'Strong and quick, you pay for what you use, and your words leave this computer.' },
      {
        title: 'On this computer',
        text: 'Free to run and private, but slower. It needs at least 64,000 tokens of context, which a small laptop may struggle with.'
      }
    ],
    question: 'Do you already have a model working? Is privacy or cost more important to you?',
    options: [
      { id: 'keep', label: 'Keep my model', text: 'It already answers' },
      { id: 'private', label: 'Privacy first', text: 'Try a model on this computer' },
      { id: 'provider', label: 'Pick a provider', text: 'Compare cost and strength' }
    ],
    sources: ['Hermes docs › Configuring models', 'Local models', 'Quickstart']
  },
  { number: 3, title: 'Where Hermes runs', short: 'This computer, or one that is always on' },
  { number: 4, title: 'Connecting things', short: 'Tools, skills, plugins, MCP' }
]

// Steps 5-7 show greyed under "After these", with no content (build-v1.md section 6).
export const LATER_STEPS = [
  { number: 5, title: 'Personality and memory' },
  { number: 6, title: 'Messaging' },
  { number: 7, title: 'Several bots' }
]
export const VERSION_LINE = 'Hermes v0.23 · docs checked 8 Nov 2026'
