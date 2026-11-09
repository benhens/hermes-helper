#!/usr/bin/env bash
# Hermes's own checks on this plugin, for the team's test machine (not part of `npm test`, which
# runs offline with Node only). Needs a Hermes v0.23.0 source checkout and a Python venv with it
# installed:
#   HERMES_SRC=/path/to/hermes-agent HERMES_VENV=/path/to/venv scripts/hermes-checks.sh
# Runs: 1) Hermes's desktop-surface lint (hermes_cli/plugin_validate_desktop.py) on desktop/plugin.js,
#       2) `hermes plugins validate` on this folder, with a throwaway HERMES_HOME,
#       3) every class in src/look.js exists in the built Hermes Desktop CSS.
set -euo pipefail
: "${HERMES_SRC:?set HERMES_SRC to a Hermes source checkout}"
: "${HERMES_VENV:?set HERMES_VENV to a venv with Hermes installed}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PY="$HERMES_VENV/bin/python"

echo "== Hermes desktop lint (plugin_validate_desktop.py) =="
"$PY" - "$HERMES_SRC/hermes_cli/plugin_validate_desktop.py" "$HERE/desktop/plugin.js" <<'PY'
import importlib.util, sys
spec = importlib.util.spec_from_file_location("v", sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
src = open(sys.argv[2]).read()
refused = m.desktop_surface_findings(src)
review = m.desktop_review_findings(src)
print("refused:", refused)
print("review:", review)
sys.exit(1 if refused or review else 0)
PY

echo "== hermes plugins validate =="
TMP_HOME="$(mktemp -d)"
trap 'rm -rf "$TMP_HOME"' EXIT
HERMES_HOME="$TMP_HOME" "$HERMES_VENV/bin/hermes" plugins validate "$HERE"

echo "== every page class exists in Hermes's built CSS =="
shopt -s nullglob
CSS_FILES=("$HERMES_SRC"/apps/desktop/dist/assets/*.css)
if [ ${#CSS_FILES[@]} -eq 0 ]; then
  echo "no Hermes desktop build in $HERMES_SRC/apps/desktop/dist: build it first (npm run build)" >&2
  exit 1
fi
node "$HERE/scripts/check-hermes-classes.mjs" --codicons "$HERMES_SRC/node_modules/@vscode/codicons/dist/codicon.css" "${CSS_FILES[@]}"
