# content/

`steps-v1.json`: the Setup steps 1-4, written by the Helper content team (hhcontent). It is a
copy of the team's file; `tests/steps.test.mjs` checks the copy is unchanged wherever the team's
folder is next to this repo. `node scripts/build.mjs` turns it into `src/steps-data.js`, which is
built into `desktop/plugin.js`. Edit the JSON, never `src/steps-data.js`.
