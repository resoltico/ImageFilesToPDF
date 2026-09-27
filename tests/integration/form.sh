#!/usr/bin/env bash
# Real AppKit geometry, accessibility and off-screen previews; no modal dialog,
# screenshot permission or fabricated UI. The shipped bundle supplies the form.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
WORK=$(mktemp -d -t ImageFilesToPDF-form)
trap 'rm -rf "$WORK"' EXIT
PREVIEWS=${IFTP_FORM_PREVIEWS:-"$WORK/previews"}
mkdir -p "$PREVIEWS"
cat "$ROOT/dist/Image-Files-to-PDF.jxa" > "$WORK/form.jxa"
cat >> "$WORK/form.jxa" <<'JXA'

function requireNative(condition, message) {
    if (!condition) { throw new Error(message); }
}

function measuredControls(built, spec) {
    for (const row of spec.rows) {
        const control = built.controls[row.key];
        requireNative(ObjC.unwrap(control.accessibilityLabel) === row.label,
            `${row.key}: missing accessible name`);
        requireNative(ObjC.unwrap(control.accessibilityHelp).length > 0,
            `${row.key}: missing accessible help`);
        if (row.kind === "choice") {
            for (const option of row.options) {
                control.selectItemWithTitle(option.label);
                const needed = Number(control.cell.cellSize.width);
                requireNative(needed <= control.frame.size.width,
                    `${option.label}: needs ${needed}, has ${control.frame.size.width}`);
            }
            control.selectItemWithTitle(row.value);
        }
    }
    const children = built.view.subviews;
    for (let index = 0; index < Number(children.count); index += 1) {
        const child = children.objectAtIndex(index);
        if (child.isKindOfClass($.NSTextField) && !child.editable) {
            requireNative(child.cell.cellSize.width <= child.frame.size.width,
                `Clipped label or hint: ${ObjC.unwrap(child.stringValue)}`);
        }
    }
}

function snapshotForm(folder, scenario, appearance) {
    const spec = formSpec(scenario.answers, scenario.problems, scenario.context);
    const bridge = { objc: ObjC, ns: $ };
    const built = buildForm(bridge, spec, WIDGETS);
    const alert = WIDGETS.makeAlert($, spec);
    alert.accessoryView = built.view;
    alert.window.appearance = $.NSAppearance.appearanceNamed(appearance);
    alert.layout;
    measuredControls(built, spec);
    const content = alert.window.contentView;
    content.layoutSubtreeIfNeeded;
    requireNative(alert.window.frame.size.height <= $.NSScreen.mainScreen.visibleFrame.size.height,
        `${scenario.name}: the form is taller than the screen`);
    const bitmap = content.bitmapImageRepForCachingDisplayInRect(content.bounds);
    content.cacheDisplayInRectToBitmapImageRep(content.bounds, bitmap);
    const PNG_TYPE = 4;
    const png = bitmap.representationUsingTypeProperties(PNG_TYPE, $.NSDictionary.dictionary);
    const path = `${folder}/${scenario.name}-${appearance}.png`;
    requireNative(png.writeToFileAtomically(path, true), `Could not write ${path}`);
    alert.window.close;
    console.log(`Native layout and accessibility checked: ${path}`);
}

run = function(input) {
    ObjC.import("AppKit");
    $.NSApplication.sharedApplication;
    const answers = defaultAnswers();
    const invalid = { ...answers, dpi: "0", quality: "101", background: "not a colour" };
    const scenarios = [
        { name: "one-image", answers, problems: [],
            context: { count: 1, folders: ["/Users/example/Pictures/"] } },
        { name: "combined", answers, problems: [],
            context: { count: 12, folders: ["/Users/example/Pictures/"] } },
        { name: "separate", answers: { ...answers,
            mode: "Separate PDFs — one page per image", paperSize: "US Letter" },
            problems: [], context: { count: 12, folders: ["/Users/example/Pictures/"] } },
        { name: "folders", answers, problems: [], context: { count: 231,
            selectedFolders: 2, folders: ["/Users/example/Pictures/Trip/", "/Volumes/Photos/"] } },
        { name: "corrections", answers: invalid, problems: readAnswers(invalid).problems,
            context: { count: 12, folders: ["/Users/example/Pictures/"] } }
    ];
    for (const appearance of ["NSAppearanceNameAqua", "NSAppearanceNameDarkAqua"]) {
        // appearanceNamed takes the constant's value, not its symbol name.
        const name = ObjC.unwrap($[appearance]);
        for (const scenario of scenarios) { snapshotForm(String(input[0]), scenario, name); }
    }
    return "macOS form integration passed";
};
JXA
osascript -l JavaScript "$WORK/form.jxa" "$PREVIEWS"
