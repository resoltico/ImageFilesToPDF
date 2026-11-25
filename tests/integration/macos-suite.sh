#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
owned=$(mktemp -d -t ImageFilesToPDF-suite)
passed=0
cleanup() {
    if [ "$passed" = 1 ]; then rm -rf "$owned"; else printf 'Native suite evidence: %s\n' "$owned" >&2; fi
}
trap cleanup EXIT
NODE=$(node -p process.execPath)
node_directory=$(dirname "$NODE")
export PATH="$node_directory:$PATH"
original_home="$HOME"
export HOME="$owned"
mkdir "$HOME/Downloads"
for suite in macos background selection publication volumes cards damaged form cli hdr naming; do
    if [ "$suite" = form ]; then
        HOME="$original_home" bash "$ROOT/tests/integration/$suite.sh"
    else
        bash "$ROOT/tests/integration/$suite.sh"
    fi
done
node "$ROOT/tests/integration/finder-engine.cjs"
node "$ROOT/tests/integration/finder-pipe.cjs"
node "$ROOT/tests/integration/native-cli.cjs"
python3 "$ROOT/tests/integration/posix-process.py"
mkdir "$owned/npm"
node "$ROOT/tests/integration/npm-route.cjs" "$(node "$ROOT/tools/npm-package.mjs" "$owned/npm")"
passed=1
