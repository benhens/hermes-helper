# content/

`videos.json` (loom2): the plugin's own file, not a team copy. One video per set-up card on the Dashboard (card id to
`url`, `poster`, `captions`, each an https:// address or empty). Empty `url`: the opened card shows a quiet "Video
coming soon" box. `node scripts/build.mjs` checks it (only https:// addresses; every card, nothing else) and builds it
into `src/dash-data.js`. A video loads from the web only when the person presses Play.

`steps-v1.json`: the Setup steps 1-4, written by the Helper content team (hhcontent). It is a
copy of the team's file; `tests/steps.test.mjs` checks the copy is unchanged wherever the team's
folder is next to this repo. `node scripts/build.mjs` turns it into `src/steps-data.js`, which is
built into `desktop/plugin.js`. Edit the JSON, never `src/steps-data.js`.
