#!/usr/bin/env bash
# Actual namespace equivalence, production names and case-sensitive controls.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
WORK=$(mktemp -d -t ImageFilesToPDF-naming)
MOUNT=''
cleanup() {
    if [ -n "$MOUNT" ]; then hdiutil detach -force -quiet "$MOUNT" 2>/dev/null || true; fi
    node - "$WORK" <<'NODE'
const fs=require("node:fs"),path=require("node:path");
const folder=process.argv[2];
if(!path.basename(folder).startsWith("ImageFilesToPDF-naming.")) {throw Error("Unexpected owned test folder");}
fs.rmSync(folder,{recursive:true,force:true});
NODE
}
trap cleanup EXIT
# shellcheck source=tests/integration/lib/fixtures.sh
source "$ROOT/tests/integration/lib/fixtures.sh"
# shellcheck source=tests/integration/lib/volume.sh
source "$ROOT/tests/integration/lib/volume.sh"
require_tools
solid_svg "$WORK/blue.svg" 400 200 '#235789'
solid_svg "$WORK/red.svg" 400 200 '#DF2935'
vips copy "$WORK/blue.svg" "$WORK/photo.jpg[Q=92,keep=none]"
vips copy "$WORK/red.svg" "$WORK/photo.png"
node "$ROOT/tools/build-probe.mjs" tests/integration/naming-probe.js "$WORK/names.jxa"
mkdir "$WORK/local"
node "$ROOT/tests/integration/naming-contract.cjs" "$ROOT/dist/Image-Files-to-PDF.jxa" "$WORK" "$WORK/local" local measure
for spec in 'APFS|apfs|insensitive' 'Case-sensitive APFS|apfs-cs|sensitive' 'HFS+|hfs|insensitive' 'Case-sensitive HFS+|hfs-cs|sensitive' 'MS-DOS FAT32|fat32|insensitive' 'ExFAT|exfat|insensitive'; do
    format=${spec%%|*}; rest=${spec#*|}; label=${rest%%|*}; expected=${rest#*|}
    MOUNT="$WORK/mount-$label"
    if ! attach_test_volume "$format" "IFTP-$label" "$MOUNT"; then
        printf 'Required naming-control volume could not attach: %s\n' "$format" >&2
        exit 1
    fi
    node "$ROOT/tests/integration/naming-contract.cjs" "$ROOT/dist/Image-Files-to-PDF.jxa" "$WORK" "$MOUNT" "$label" "$expected"
    detach_test_volume "$MOUNT"; MOUNT=''
done
printf 'macOS naming integration passed\n'
