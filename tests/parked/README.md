# Parked tests (dash-v1, 11 Nov 2026)

The first build's page had two tabs, Setup (a step list with the open step) and Your setup (seven cards). Pēteris
rejected them; the Dashboard job (Lead, 11 Nov 2026) took both off the page: "keep their code out of the page, do
not delete project files". Their code stays in src/ (steps.js, steps-data.js, setup-tab.js, setup-cards.js), out of
the built file (scripts/build.mjs PARKED).

These two files tested those tabs on the rendered page. The page no longer has them, so they cannot run; they are
kept here, renamed so `node --test tests/` does not pick them up, as a record of what the tabs did. The tests of the
parked modules themselves (tests/steps.test.mjs, tests/setup-cards.test.mjs) still run.
