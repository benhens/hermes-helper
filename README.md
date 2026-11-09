# Helping Hand

A Hermes Desktop plugin that helps you understand Hermes and set it up the way you want, one step at a time. It explains and checks; it never installs, builds or changes settings for you.

Status: early build (B3: Setup steps 1-4, the helper panel, and the "Your setup" checks). The helper doesn't ask your model yet: for now it answers from fixed text only.

## What it adds

- One row in Hermes's left sidebar: **Helping Hand**.
- One page with two tabs: **Setup** (steps, one at a time) and **Your setup** (checks of your own Hermes).
- **Your setup** shows seven cards, each with one status (Works, Needs a fix, Not set up yet, Not checked yet, Can't check right now), the fixed rule it passes by, and what to do next: Hermes is connected, a model is connected, the model answers, the personality file (SOUL.md), skills, the memory switch, and a memory test you run in your own chat. With more than one bot (profile), a picker chooses which bot the cards show. Fixed rules in code decide every status; no AI judges anything.
- **Setup** has four steps: what you want Hermes to do, the brain (models), where Hermes runs, and connecting things (tools, skills, plugins, MCP). Each step explains in plain words, shows what the official Hermes docs say with a link to each page, and asks one question with answer cards. "I understand, next step" moves on; your answers are kept. Steps 5-7 are listed as coming later.
- A helper panel beside the steps. Its words sit at the bottom, just above the message box, with a small character. The **Chat log** switch shows everything said so far. If you ask it to do something for you (install, connect, set up), it gives you a text to paste into a new chat with your own Hermes instead, because Helping Hand never changes anything itself. You can move it to the other side, hide it to a thin strip at the page edge (press the strip to bring it back), or close it ("Show helper" brings it back). The plugin stays switched on in every case.
- Narrow windows: when the open step would get narrower than 320 px, the helper folds into its strip by itself and comes back when the window is wider; pressing the strip then opens it over the page. If the step is still too narrow, the step list shows only its numbers. Side-by-side text and the "Your setup" cards go to one column.

## What it reads, sends and changes

- Reads your Hermes setup only through Hermes's own read-only calls: whether a model is ready and its name (`setup.runtime_check`, `setup.status`, `free_tier.status`), your SOUL.md text (`profiles.describe`), which skills and toolsets are on, and your bot names. It never reads `.env`, `auth.json` or your config file.
- The "The model answers" card makes one call to your own model through Hermes, and only when you press Check. It asks the model to reply "OK", which spends a little of your model credit. Nothing is saved to your chats and no tools run.
- Changes nothing in your setup. Where a card suggests a fix, it gives you text to paste into your own chat; you decide and press Send.
- Makes no network calls of its own: no telemetry, no server, no self-update. A source tag ("Hermes docs › …") opens that official docs page in your web browser when you press it. Its own settings (which tab, where the helper sits, your answer to the memory test) stay on your computer in Hermes's plugin storage.
- Never sends a pasted API key anywhere: the message box checks for one first and shows where keys belong instead.
- Later builds: each helper message will make one call to your own model through Hermes, the same way. In this build the helper answers from fixed text and makes no model call.

## Install

Coming with the public release (an install link of the form `hermes://plugin/install?repo=<owner>/<repo>&enable=1`).

## Remove

Capabilities → Plugins → Helping Hand → remove.

## For developers

- `src/` holds the readable sources; `node scripts/build.mjs` joins them into `desktop/plugin.js`, the one file Hermes loads. Edit `src/`, then build.
  - `src/setup-cards.js`: the card rules and fixed words (pure code). `src/setup-tab.js`: the reads and the cards on screen.
  - `src/model-call.js`: the one way the page asks your model (`llm.oneshot`, task `helping_hand`, 90 s) and the fixed line for each way it can fail.
  - `src/key-check.js`: stops a pasted API key before anything goes to a model.
  - `content/steps-v1.json`: the step texts, written by the Helping Hand content team; the build turns it into `src/steps-data.js`. `src/steps.js`: the rules around it (next step, the "do it for me" words, the hand-over text). `src/helper-chat.js`: what the helper says.
  - `src/character.js` and `src/pet-sheet.js`: the helper's character. Today a drawn hand; when `PET_SHEET` holds a sprite sheet in the petdex layout (8 × 9 cells of 192 × 208), it shows that pet in the theme's accent colour, with one row per state (idle, waving, jumping, failed, review).
- `npm test` runs offline with Node only: build is current, `node --check`, colour lint, plugin shape, model check, card rules, key check, step data checks (sources, word limits, answer cards), the helper's lines, the character's poses with a test sprite sheet, and the page and tab rendered with stand-ins for React and Hermes.
- `scripts/hermes-checks.sh` (needs a Hermes v0.23.0 checkout and venv): Hermes's desktop lint, `hermes plugins validate`, and a check that every class the page uses exists in Hermes's own built CSS.
- The look: Hermes's own UI kit components, plus class strings copied from Hermes's own screens (`src/look.js`, each group names its source file). No colours, fonts or CSS of its own.
- The model's name is shown the way Hermes's own model button shows it ("Mock Small", "Opus 4.8"); on the free tier it says "Nous · free tier". `src/model-name.js` holds those naming rules, adapted from Hermes Agent (MIT License, Copyright (c) 2025 Nous Research, `apps/desktop/src/lib/model-status-label.ts`).

## Known issues

- No `__init__.py` on purpose: it is a desktop-only plugin, so `hermes plugins validate` shows the expected warning "capability probe skipped (manifest-only plugin)".
- The SOUL.md card compares your file with Hermes's own default text (copied from Hermes v0.23.0). If a later Hermes changes that text, an untouched file would show "Works".
- If your SOUL.md exists but Hermes can't read it (for example its permissions), Hermes uses the built-in personality and the card says so; it can't tell that the file is there.
- The pasted-key check also stops a long run of letters and digits that isn't a key (for example a 40-character git commit id). That one message just isn't sent.
- The model-name rules are a copy of Hermes v0.23.0's. If a later Hermes changes how its model button names models, the page can differ until the copy is updated (a test compares the two wherever the Hermes source is checked out).
- Below about 660 px of window with Hermes's left sidebar shown (Hermes allows 400 px), the open step can't stay 320 px wide even with the helper folded and the step list as numbers; hiding Hermes's sidebar gives the page the room back.

## Licence

MIT, see LICENSE. `src/model-name.js` is adapted from Hermes Agent, MIT License, Copyright (c) 2025 Nous Research.
