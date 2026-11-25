"use strict";

/*
 * Choosing an executable after setup failed, and remembering the choice.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createFoundation, withFoundation } = require("../ports/fake-foundation.cjs");
const { chooseExecutable, executableMemory } = require("../../../src/finder/quick-action/executable-choice.js");
const { runOutcome } = require("../../../src/core/outcomes.js");
const { setupToolProblem } = require("../../../src/core/setup.js");

const RECEIPT = runOutcome([], [], [setupToolProblem("tool-missing", "vips")]);

function app({ button, chosen }) {
    return {
        displayDialog: (text, options) => ({ buttonReturned: button === "choose" ? options.buttons.find((name) => name !== "Skip") : "Skip" }),
        chooseFile: () => { if (chosen instanceof Error) { throw chosen; } return chosen; }
    };
}

function hostCancel() {
    const error = new Error("User canceled.");
    error.errorNumber = -128;
    return error;
}

test("a person who skips chooses nothing", () => {
    assert.equal(chooseExecutable(app({ button: "skip", chosen: "/opt/x/vips" }), "vips", RECEIPT), undefined);
});

test("a chosen absolute file is returned, and anything else is not", () => {
    assert.equal(chooseExecutable(app({ button: "choose", chosen: "/opt/x/vips" }), "vips", RECEIPT), "/opt/x/vips");
    assert.equal(chooseExecutable(app({ button: "choose", chosen: "relative/vips" }), "vips", RECEIPT), undefined);
    assert.equal(chooseExecutable(app({ button: "choose", chosen: hostCancel() }), "vips", RECEIPT), undefined);
    assert.throws(() => chooseExecutable(app({ button: "choose", chosen: new Error("chooser broke") }), "vips", RECEIPT), /chooser broke/u);
});

test("chosen executables are remembered per name and only known names are recalled", () => {
    const foundation = createFoundation({ defaults: { "test.domain": { "executable.node": "/opt/node", "executable.other": "/x", "executable.vips": "" } } });
    withFoundation(foundation, () => {
        const memory = executableMemory("test.domain");
        assert.deepEqual(memory.recalled, { node: "/opt/node" });
        memory.remember("pdfcpu", "/opt/pdfcpu");
        assert.equal(foundation.state.defaults["test.domain"]["executable.pdfcpu"], "/opt/pdfcpu");
        assert.deepEqual(memory.diagnostics, []);
    });
});

test("the setup report and the choice are shown natively, and the chooser shows hidden files", () => {
    const { createFakeObjC } = require("../ports/fake-objc.cjs");
    const { reportText } = require("../../../src/core/run-report.js");
    const { message } = require("../../../src/core/messages.js");
    const bridge = createFakeObjC({ responses: [1001] });
    const chosen = [];
    const host = { ObjC: globalThis.ObjC, $: globalThis.$ };
    Object.assign(globalThis, { ObjC: bridge.objc, $: bridge.ns });
    try {
        const path = chooseExecutable({ chooseFile: (options) => { chosen.push(options); return "/opt/x/vips"; } }, "vips", RECEIPT);
        assert.equal(path, "/opt/x/vips");
    } finally { Object.assign(globalThis, host); }
    const [alert] = bridge.state.alerts;
    assert.equal(alert.messageText, "Image Files to PDF");
    assert.equal(alert.informativeText, `${message("setupFailed")} Choose a location for vips.`);
    assert.equal(alert.accessoryView.documentView.string, reportText(RECEIPT, false));
    assert.deepEqual(alert.buttons.map((button) => button.title ?? button), ["Skip", "Choose…"]);
    assert.deepEqual(chosen, [{ withPrompt: "Choose the vips executable.", invisibles: true }]);
});

test("without the native alert, the full report pages end with the choice", () => {
    const { reportText } = require("../../../src/core/run-report.js");
    const seen = [];
    const paged = { displayDialog(text, options) { seen.push({ text, buttons: options.buttons }); return { buttonReturned: "Skip" }; } };
    assert.equal(chooseExecutable(paged, "vips", RECEIPT), undefined);
    const text = seen.map((page) => page.text).join("\n");
    assert.ok(text.startsWith(reportText(RECEIPT).slice(0, 40)));
    assert.ok(text.endsWith("\n\nChoose a location for vips."));
    assert.deepEqual(seen.at(-1).buttons, ["Choose…", "Skip"]);
});
