# Helper

A Hermes Desktop plugin that helps you understand Hermes and set it up the way you want, one step at a time. It explains and checks; it never installs, builds or changes settings for you.

Status: early build (Setup steps 1-4, Helper's conversation window, and the "Your setup" checks). Helper doesn't ask your model yet: it answers from pre-written lines chosen by fixed rules.

## What it adds

- One row in Hermes's left sidebar: **Helper**.
- One page with two tabs: **Setup** (steps, one at a time) and **Your setup** (checks of your own Hermes).
- **Your setup** shows seven cards, each with one status (Works, Needs a fix, Not set up yet, Not checked yet, Can't check right now), the fixed rule it passes by, and what to do next: Hermes is connected, a model is connected, the model answers, the personality file (SOUL.md), skills, the memory switch, and a memory test you run in your own chat. With more than one bot (profile), a picker chooses which bot the cards show. Fixed rules in code decide every status; no AI judges anything.
- **Setup** has four steps: what you want Hermes to do, the brain (models), where Hermes runs, and connecting things (tools, skills, plugins, MCP). Each step explains in plain words, shows what the official Hermes docs say with a link to each page, and asks one question with answer cards. "I understand, next step" moves on; your answers are kept. Steps 5-7 are listed as coming later.
- Helper's conversation window on the right. Its character sits on the top edge of the message box: two eyes and a mouth in the theme's accent colour, holding on with its fingers. It comes up from behind the box when the page opens, its eyes follow your cursor while it is over this page (or the field the keyboard is on), and it shows when it is busy, asking or talking. Helper's newest sentence is in a speech bubble above the character and appears word by word; press a key or the mouse to see the rest at once. Older lines move up as small bubbles, your own messages are on the right, and the conversation scrolls when it is full. Under a question, the answers you can pick sit beside the character; picking one answers at once, and you can always type instead. Some lines hold a button: one opens a text to paste into a chat with your own Hermes, one opens Hermes's own Messaging, Model or Capabilities screen. If you ask Helper to do something for you (install, connect, set up), it gives you a text to paste into a new chat with your own Hermes instead, because Helper never changes anything itself. With your system's "reduce motion" setting on, the character stays still and each line appears whole.
- Drag the window's left edge to make it between 360 and 600 px wide (or use the arrow keys on it); the width is remembered.
- Narrow windows: first the step list shows only its numbers, then Helper's window narrows to 360 px. When the page is too narrow for both sides, Helper lies over the page with a thin strip at the page's right edge; press the strip (or Escape) to fold Helper away, and the strip again to bring it back. Side-by-side text and the "Your setup" cards go to one column.

## What it reads, sends and changes

- Reads your Hermes setup only through Hermes's own read-only calls: whether a model is ready and its name (`setup.runtime_check`, `setup.status`, `free_tier.status`), your SOUL.md text (`profiles.describe`), which skills and toolsets are on, and your bot names. It never reads `.env`, `auth.json` or your config file.
- The "The model answers" card makes one call to your own model through Hermes, and only when you press Check. It asks the model to reply "OK", which spends a little of your model credit. Nothing is saved to your chats and no tools run.
- Changes nothing in your setup. Where a card suggests a fix, it gives you text to paste into your own chat; you decide and press Send.
- Makes no network calls of its own: no telemetry, no server, no self-update. A source tag ("Hermes docs › …") opens that official docs page in your web browser when you press it.
- What it keeps on your computer, in Hermes's plugin storage: which tab and step are open, your answers on the steps, the width of Helper's window, and your answer to the memory test. Nothing else. What you tell Helper in the conversation (your name, what you do, your messages) is used for that visit only and is written nowhere: it is gone when Hermes restarts.
- Never sends a pasted API key anywhere: the message box checks for one first and shows where keys belong instead. The key is not shown back and not kept.
- Later builds: a typed message that the fixed rules cannot place will make one call to your own model through Hermes, the same way. In this build Helper answers from pre-written lines and makes no model call.

## Install

Coming with the public release (an install link of the form `hermes://plugin/install?repo=<owner>/<repo>&enable=1`).

## Remove

Capabilities → Plugins → Helper → remove.

## For developers

- `src/` holds the readable sources; `node scripts/build.mjs` joins them into `desktop/plugin.js`, the one file Hermes loads. Edit `src/`, then build.
  - `src/setup-cards.js`: the card rules and fixed words (pure code). `src/setup-tab.js`: the reads and the cards on screen.
  - `src/model-call.js`: the one way the page asks your model (`llm.oneshot`, task `helping_hand`, 90 s) and the fixed line for each way it can fail.
  - `src/key-check.js`: stops a pasted API key before anything goes to a model.
  - `content/steps-v1.json`: the step texts, written by the Helper content team; the build turns it into `src/steps-data.js`. `src/steps.js`: the rules around it (next step, the "do it for me" words, the hand-over text).
  - Helper's conversation. `content/helper-talk-v2.json`: every line Helper can say, its key words and its answers to pick, written by the content team. The build checks it (`scripts/talk-data.mjs`: every line has a source and keeps the word limits, every answer gives a row of its own topic, no list of things to pick is longer than five; with a problem the build stops and writes nothing) and turns the fields the code uses into `src/talk-data.js`. `src/talk.js`: the fixed order of steps that picks a line (a pasted key first, then a request to do something, the opening, key words). `src/talk-view.js`: the window's parts. `src/bubble-link.js`: the piece between the bubble and the character, one small file so its shape can be swapped. `src/layout.js`: how the page fits its window.
  - `src/talk.css`: the one style sheet of the plugin's own, for Helper's window only. Every class starts with `hh-`, every colour is a Hermes variable, and it has no fonts and no shadows. The build turns it into `src/talk-css.js`; the page puts it in a `<style>` element inside its own page, so it leaves with the page.
  - The character, drawn by the page itself as inline SVG shapes in the accent colour (no picture file): `src/expressions.js` holds the numbers of its four expressions (resting, busy, asking, talking) and the rule for which one shows; `src/character.js` draws it and moves it; `src/eyes.js` turns the pupils toward the cursor or the focused field; `src/reveal.js` shows Helper's lines word by word (`WORD_MS`, 120 ms a word); `src/motion.js` reads the "reduce motion" setting. It is 168 px wide, or 132 px when Helper's window is under 420 px wide or the page under 600 px high (`src/layout.js`).
- `npm test` runs offline with Node only: build is current, `node --check`, colour lint, plugin shape, model check, card rules, key check, step data checks (sources, word limits, answer cards), Helper's answers compared turn by turn with the content team's own reference script, the build checks on the talk data, the style sheet's rules, every stored key against an allowed list, the character (each expression's shapes, when each shows, the word-by-word reveal, the eye maths, the rising, reduce motion), and the page, the conversation and the tab rendered with stand-ins for React and Hermes.
- `scripts/hermes-checks.sh` (needs a Hermes v0.23.0 checkout and venv): Hermes's desktop lint, `hermes plugins validate`, and a check that every class the page uses exists in Hermes's own built CSS.
- The look: the left side wears Hermes's own UI kit components, plus class strings copied from Hermes's own screens (`src/look.js`, table `K`; each group names its source file). Helper's window wears the classes of `src/talk.css` (table `T`). No colours or fonts of its own anywhere.
- The model's name is shown the way Hermes's own model button shows it ("Mock Small", "Opus 4.8"); on the free tier it says "Nous · free tier". `src/model-name.js` holds those naming rules, adapted from Hermes Agent (MIT License, Copyright (c) 2025 Nous Research, `apps/desktop/src/lib/model-status-label.ts`).

## Known issues

- No `__init__.py` on purpose: it is a desktop-only plugin, so `hermes plugins validate` shows the expected warning "capability probe skipped (manifest-only plugin)".
- The SOUL.md card compares your file with Hermes's own default text (copied from Hermes v0.23.0). If a later Hermes changes that text, an untouched file would show "Works".
- If your SOUL.md exists but Hermes can't read it (for example its permissions), Hermes uses the built-in personality and the card says so; it can't tell that the file is there.
- The pasted-key check also stops a long run of letters and digits that isn't a key (for example a 40-character git commit id). That one message just isn't sent.
- The model-name rules are a copy of Hermes v0.23.0's. If a later Hermes changes how its model button names models, the page can differ until the copy is updated (a test compares the two wherever the Hermes source is checked out).
- Below about 660 px of window with Hermes's left sidebar shown, the open step can't stay 320 px wide even with Helper folded away and the step list as numbers; hiding Hermes's sidebar gives the page the room back.
- In a window 1440 px wide with Hermes's left sidebar shown, the open step is about 464 px wide beside Helper's window, so a step's side-by-side comparison shows as one column. Dragging Helper's window narrower, or hiding Hermes's sidebar, brings the two columns back.
- In a wide window Helper's window cannot be hidden; it can be made as narrow as 360 px.

## Licence

MIT, see LICENSE. `src/model-name.js` is adapted from Hermes Agent, MIT License, Copyright (c) 2025 Nous Research.
