"use strict";

/*
 * What the settings form reads back from its controls, and the action that
 * swaps the explanation when the mode pop-up changes.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { inspectModule } = require("../ports/inspect-module.cjs");
const { createFakeObjC } = require("../ports/fake-objc.cjs");

const { readControls, modeController } = inspectModule(require.resolve("../../../src/finder/quick-action/appkit.js"), ["readControls", "modeController"]);
const { buildForm, presentForm, WIDGETS } = require("../../../src/finder/quick-action/appkit.js");
const { formSpec } = require("../../../src/finder/quick-action/settings-model.js");

const ROWS = [
    { key: "mode", kind: "choice", options: [{ value: "single" }, { value: "joined" }] },
    { key: "background", kind: "color", options: [{ label: "White", value: "#FFFFFF" }] },
    { key: "quality", kind: "number" }
];

function control(stringValue, indexOfSelectedItem = -1) {
    const validated = { count: 0 };
    const value = { stringValue, indexOfSelectedItem, validated };
    Object.defineProperty(value, "validateEditing", { get() { validated.count += 1; return undefined; } });
    return value;
}

test("choices are read by index, typed values as typed, and a picked color as its value", () => {
    const bridge = { objc: { unwrap: (value) => value } };
    const read = (background) => readControls(bridge, { rows: ROWS }, { mode: control("", 1), background, quality: control("80") });
    const picked = control("White", 0);
    assert.deepEqual(read(picked), { mode: "joined", background: "#FFFFFF", quality: "80" });
    assert.equal(picked.validated.count, 1, "a field still being edited is committed first");
    // A preset picked and then typed over is what was typed.
    assert.deepEqual(read(control("#123456", 0)).background, "#123456");
    assert.deepEqual(read(control("#ABCDEF")).background, "#ABCDEF");
});

test("changing the mode shows that mode's explanation", () => {
    const { ns, objc, state } = createFakeObjC();
    const documentView = { kind: "text", string: "" };
    const built = { details: { documentView }, controls: { mode: {} } };
    const spec = { summaryDetails: { single: "One PDF per image.", joined: "One PDF for all." } };
    const controller = modeController({ ns, objc }, built, spec);
    assert.equal(built.controls.mode.target, controller);
    assert.equal(built.controls.mode.action, ns.NSSelectorFromString("modeChanged:"));
    controller.modeChanged({ selectedItem: { representedObject: "joined" } });
    assert.equal(documentView.string, "One PDF for all.");
    // The class is registered once and reused.
    const again = modeController({ ns, objc }, { details: { documentView }, controls: { mode: {} } }, spec);
    again.modeChanged({ selectedItem: { representedObject: "single" } });
    assert.equal(documentView.string, "One PDF per image.");
    assert.equal(state.registrations.length, 1);
    const [registered] = state.registrations;
    assert.match(registered.name, /^ImageFilesToPDF/u);
    assert.equal(registered.superclass, "NSViewController");
    assert.deepEqual(registered.methods["modeChanged:"].types, ["void", ["id"]]);
});

test("the explanation sits above the rows, and fills the view to its top", () => {
    const { ns, objc } = createFakeObjC();
    const placed = [];
    const widgets = { ...WIDGETS, makeDetails(...args) { placed.push(args[2]); return WIDGETS.makeDetails(...args); } };
    const built = buildForm({ ns, objc }, formSpec(), widgets);
    const [rect] = placed;
    const rowsTop = Math.max(...Object.values(built.controls).map(({ rect: row }) => row.bottom + row.height));
    assert.ok(rect.bottom > rowsTop, "above the last row");
    assert.equal(rect.left, 0);
    assert.equal(built.view.rect.height, rect.bottom + rect.height);
});

test("with nothing to correct, the first number field takes the focus", () => {
    const bridge = createFakeObjC({ responses: [1001] });
    const spec = formSpec();
    presentForm(bridge, spec);
    const [alert] = bridge.state.alerts;
    const firstNumber = spec.rows.find((row) => row.kind === "number");
    assert.equal(alert.window.initialFirstResponder.stringValue, String(firstNumber.value));
    assert.notEqual(spec.rows[0].kind, "number", "the focus is not merely the first row");
});

test("a setting to correct takes the focus", () => {
    const { defaultAnswers } = require("../../../src/finder/quick-action/settings-model.js");
    const bridge = createFakeObjC({ responses: [1001] });
    presentForm(bridge, formSpec({ ...defaultAnswers(), quality: "500" }, [{ key: "quality", message: "JPEG quality is invalid" }]));
    assert.equal(bridge.state.alerts[0].window.initialFirstResponder.stringValue, "500");
});
