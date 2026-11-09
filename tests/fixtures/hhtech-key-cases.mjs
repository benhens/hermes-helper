// COPIED from /root/projects/helping-hand/dev/checks/hhtech/check-key-pattern.mjs (hhtech, 9 Nov 2026):
// its fake keys and ordinary sentences, unchanged, so the plugin's own tests run the same cases offline.
// Everything below is a copy of lines 1-70 of that file, plus the export at the end.

// hhtech check (9 Nov 2026): does the pasted-key check (content/v1-strings.md, line K1) catch
// real-shaped keys and leave ordinary sentences alone?
// Run: node dev/checks/hhtech/check-key-pattern.mjs      (exit 1 if the PROPOSED rule fails any case)
// All keys below are fake: random characters in the real shape (prefix, length, character set).

let seed = 42
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = (set, n) => Array.from({ length: n }, () => set[Math.floor(rnd() * set.length)]).join('')
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const URLSAFE = ALNUM + '-_'
const HEX = '0123456789abcdef'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

// Shapes: prefixes and lengths as seen in providers' key pages and in Hermes's own redactor
// (dev/hermes-src/agent/redact.py, _PREFIX_PATTERNS). Nous has no documented key shape (see report).
const orKey = 'sk-or-v1-' + pick(HEX, 64)
const KEYS = [
  ['OpenAI, older', 'sk-' + pick(ALNUM, 48)],
  ['OpenAI, project', 'sk-proj-' + pick(URLSAFE, 156)],
  ['OpenAI, service account', 'sk-svcacct-' + pick(URLSAFE, 120)],
  ['Anthropic', 'sk-ant-api03-' + pick(URLSAFE, 93) + 'AA'],
  ['Anthropic, OAuth token', 'sk-ant-oat01-' + pick(URLSAFE, 93) + 'AA'],
  ['OpenRouter', orKey],
  ['Google AI Studio', 'AIza' + pick(URLSAFE, 35)],
  ['xAI', 'xai-' + pick(ALNUM, 80)],
  ['GitHub classic', 'ghp_' + pick(ALNUM, 36)],
  ['GitHub fine-grained', 'github_pat_' + pick(ALNUM, 22) + '_' + pick(ALNUM, 59)],
  ['Hugging Face', 'hf_' + pick(LETTERS, 34)],
  ['Groq', 'gsk_' + pick(ALNUM, 52)],
  ['DeepSeek', 'sk-' + pick(HEX, 32)],
  ['Mistral (no prefix)', pick(ALNUM, 32)],
  ['Together (no prefix, hex)', pick(HEX, 64)],
  ['Nous, if an opaque token (guess)', pick(ALNUM, 43)],
  ['Nous, if a JWT (guess)', 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ' + pick(URLSAFE, 120) + '.' + pick(URLSAFE, 86)],
  ['key inside a sentence', `my key is ${orKey} can you check it works`],
  ['key as an env line', 'OPENROUTER_API_KEY=' + orKey],
  ['key in quotes after a colon', `here: "${'sk-ant-api03-' + pick(URLSAFE, 93)}AA"`],
  ['key at the end with a full stop', `I pasted AIza${pick(URLSAFE, 35)}.`],
  ['key after a line break', 'this one?\n' + 'xai-' + pick(ALNUM, 80)],
]

const SENTENCES = [
  'What is a skill?',
  'I want it to sort my emails every morning',
  'explain it more simply for me',
  'Where do I paste my API key? Does it start with sk-?',
  'My OpenRouter key starts with sk-or-v1, where does it go?',
  'I have a Google key that starts with AIza, is that the right one?',
  'Our risk-management-framework-for-the-whole-team needs a review',
  'I use scikit-learn and a task-oriented-approach-for-everything',
  'task_scheduling_for_my_personal_morning_routine is the file name',
  'https://hermes-agent.nousresearch.com/docs/getting-started/quickstart',
  'Open https://hermes-agent.nousresearch.com/docs/user-guide/features/personality#how-soulmd-works-now please',
  'hahahahahahahahahahahahahahahahahahahahaha this is confusing',
  'Pneumonoultramicroscopicsilicovolcanoconiosis is a long word',
  'I have a Mac mini M4 with 16GB RAM and a 512GB SSD',
  'Mans dators ir Windows 11, vai tas der Hermes?',
  'Can Hermes read my Google Drive and Gmail?',
  'Write to peteris.benhens@example.com when it is done',
  'My phone number is +371 2000 0000',
  'Use anthropic/claude-sonnet-4.5 or openrouter/google/gemini-2.5-flash-preview-09-2025',
  'I saved hermes-config-backup-2026-11-09-final-version.yaml on the desktop',
  'Where is ~/.hermes/config.yaml and SOUL.md?',
  'Can I run qwen2.5:3b-instruct-q4_K_M on my laptop with Ollama?',
  'The order number was 2026110900012345 and the code AB12',
  'skill-creator, hermes-agent and google-workspace are on',
  'I want a bot that answers in Telegram, WhatsApp and Discord at the same time',
]

export { KEYS, SENTENCES, orKey }
