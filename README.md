# Helping Hand

A Hermes Desktop plugin that helps you understand Hermes and set it up the way you want, one step at a time. It explains and checks; it never installs, builds or changes settings for you.

Status: early build (B1, the page shell). The step texts and the setup checks are still being written.

## What it adds

- One row in Hermes's left sidebar: **Helping Hand**.
- One page with two tabs: **Setup** (steps, one at a time) and **Your setup** (checks of your own Hermes, coming next).
- A helper panel beside the steps. You can move it to the other side, hide it to a small round button, or close it ("Show helper" brings it back). The plugin stays switched on in every case.

## What it reads, sends and changes

- Reads your Hermes setup only through Hermes's own read-only calls. In this build: whether a model is connected (`setup.runtime_check`) and the model's name. It never reads `.env`, `auth.json` or your config file.
- Changes nothing in your setup.
- Makes no network calls of its own: no telemetry, no server, no self-update. Its own settings (which tab, where the helper sits) stay on your computer in Hermes's plugin storage.
- Later builds: each helper message will make one call to your own model through Hermes, which spends a little of your model credit. Nothing is saved to your chats.

## Install

Coming with the public release (an install link of the form `hermes://plugin/install?repo=<owner>/<repo>&enable=1`).

## Remove

Capabilities → Plugins → Helping Hand → remove.

## For developers

- `src/` holds the readable sources; `node scripts/build.mjs` joins them into `desktop/plugin.js`, the one file Hermes loads. Edit `src/`, then build.
- `npm test` runs offline with Node only: build is current, `node --check`, colour lint, plugin shape, model check, state.
- `scripts/hermes-checks.sh` (needs a Hermes v0.23.0 checkout and venv): Hermes's desktop lint, `hermes plugins validate`, and a check that every class the page uses exists in Hermes's own built CSS.
- The look: Hermes's own UI kit components, plus class strings copied from Hermes's own screens (`src/look.js`, each group names its source file). No colours, fonts or CSS of its own.

## Known issues

- No `__init__.py` on purpose: it is a desktop-only plugin, so `hermes plugins validate` shows the expected warning "capability probe skipped (manifest-only plugin)".

## Licence

MIT, see LICENSE.
