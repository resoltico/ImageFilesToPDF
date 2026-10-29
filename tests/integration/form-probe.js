"use strict";
const { formSpec, defaultAnswers } = require("../../src/host/settings-model.js");
const { readAnswers } = require("../../src/host/settings-model.js");
const { buildForm } = require("../../src/host/appkit.js");
const { WIDGETS } = require("../../src/host/appkit.js");
const { detailsAlert } = require("../../src/host/details-dialog.js");
const SMALLEST_VISIBLE_HEIGHT = 744;
const PNG_TYPE = 4;

function requireNative(condition, message) {
    if (!condition) { throw new Error(message); }
}

function measureControl(control, row) {
    requireNative(ObjC.unwrap(control.accessibilityLabel) === row.label, `${row.key}: missing accessible name`);
    requireNative(ObjC.unwrap(control.accessibilityHelp).length > 0, `${row.key}: missing accessible help`);
    if (row.kind === "choice") {
        for (const option of row.options) {
            control.selectItemWithTitle(option.label);
            const needed = Number(control.cell.cellSize.width);
            requireNative(needed <= control.frame.size.width, `${option.label}: needs ${needed}, has ${control.frame.size.width}`);
        }
        control.selectItemAtIndex(row.options.findIndex((option) => option.value === row.value));
    }
}

function measuredControls(built, spec) {
    for (const row of spec.rows) { measureControl(built.controls[row.key], row); }
    const children = built.view.subviews;
    for (let index = 0; index < Number(children.count); index += 1) {
        const child = children.objectAtIndex(index);
        if (child.isKindOfClass($.NSTextField) && !child.editable) {
            requireNative(child.cell.cellSize.width <= child.frame.size.width, `Clipped label or hint: ${ObjC.unwrap(child.stringValue)}`);
        }
    }
}

function nativeForm(scenario) {
    const spec = formSpec(scenario.answers, scenario.problems, scenario.context);
    const built = buildForm({ objc: ObjC, ns: $ }, spec, WIDGETS);
    const alert = WIDGETS.makeAlert($, spec);
    alert.accessoryView = built.view;
    measuredControls(built, spec);
    return alert;
}

function writePreview(alert, path) {
    const content = alert.window.contentView;
    // Native zero-argument methods are getter accesses in JXA.
    // eslint-disable-next-line no-unused-expressions
    content.layoutSubtreeIfNeeded;
    const bitmap = content.bitmapImageRepForCachingDisplayInRect(content.bounds);
    content.cacheDisplayInRectToBitmapImageRep(content.bounds, bitmap);
    const png = bitmap.representationUsingTypeProperties(PNG_TYPE, $.NSDictionary.dictionary);
    requireNative(png.writeToFileAtomically(path, true), `Could not write ${path}`);
}

function snapshot(folder, scenario, appearance) {
    const alert = scenario.detail ? detailsAlert($, scenario) : nativeForm(scenario);
    alert.window.appearance = $.NSAppearance.appearanceNamed(appearance);
    // eslint-disable-next-line no-unused-expressions
    alert.layout;
    const height = Number(alert.window.frame.size.height);
    requireNative(height <= SMALLEST_VISIBLE_HEIGHT, `${scenario.name}: ${height} points exceeds ${SMALLEST_VISIBLE_HEIGHT}`);
    const path = `${folder}/${scenario.name}-${appearance}.png`;
    writePreview(alert, path);
    // eslint-disable-next-line no-unused-expressions
    alert.window.close;
    // Diagnostic output from this native gate, never product stdout.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ scenario: scenario.name, appearance, height, path }));
}

function scenariosFor(longPath) {
    const answers = defaultAnswers();
    const invalid = { ...answers, dpi: "1018", quality: "101", background: "purple" };
    const {problems} = readAnswers(invalid);
    const common = { answers, problems: [], context: { count: 12, folders: ["/Pictures/"] } };
    return [
        { ...common, name: "one-image", context: { count: 1, folders: ["/Pictures/"] } },
        { ...common, name: "combined" },
        { ...common, name: "separate", answers: { ...answers, mode: "separate", paperSize: "Letter" } },
        { ...common, name: "corrections", answers: invalid, problems },
        { ...common, name: "deep-path-errors", answers: invalid, problems, context: { count: 12, folders: [longPath] } },
        { ...common, name: "many-destinations", context: { count: 12, folders: Array.from({ length: 12 }, (ignored, index) => `/Volumes/Photos${index}/`) } },
        ...["setup", "confirmation", "rejection", "completion"].map((name) => ({ name, title: "Image Files to PDF", summary: "Review full details.",
            detail: Array.from({ length: 100 }, (ignored, index) => `${index}: ${longPath}`).join("\n"), buttons: ["Continue", "Cancel"] }))
    ];
}

function run(input) {
    ObjC.import("AppKit");
    // eslint-disable-next-line no-unused-expressions
    $.NSApplication.sharedApplication;
    const scenarios = scenariosFor(String(input[1]));
    for (const appearance of ["NSAppearanceNameAqua", "NSAppearanceNameDarkAqua"]) {
        const name = ObjC.unwrap($[appearance]);
        for (const scenario of scenarios) { snapshot(String(input[0]), scenario, name); }
    }
    return "macOS form integration passed";
}
module.exports = { run };
