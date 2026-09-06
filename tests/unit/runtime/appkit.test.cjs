"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { presentForm } = require("../../../src/runtime/appkit.js");
const { formSpec, defaultAnswers } = require("../../../src/core/form.js");
const { createFakeObjC } = require("./fake-objc.cjs");

const CREATE = 1000;
const CANCEL = 1001;
const ABORT = -1001;

function present(responses, spec = formSpec()) {
    const bridge = createFakeObjC({ responses });

    return { bridge, outcome: presentForm(bridge, spec) };
}

test("clicking Create returns what the controls hold", () => {
    const { outcome } = present([CREATE]);

    assert.deepEqual(outcome.answers, defaultAnswers());
    assert.equal(outcome.cancelled, undefined);
});

test("clicking Cancel is an answer, not a failure", () => {
    const { outcome } = present([CANCEL]);

    assert.deepEqual(outcome, { cancelled: true });
});

test("a form that never appeared is reported as unavailable", () => {
    // The watchdog aborting means nobody answered, which cannot be told from
    // an invisible window. Reporting it as a cancellation would silently drop
    // the run; reporting it as unavailable falls back to the dialogs.
    const { outcome } = present([ABORT]);

    assert.equal(outcome, null);
});

test("the modal is guarded by an abortModal watchdog", () => {
    const { bridge } = present([CREATE]);

    assert.equal(bridge.state.watchdogs.length, 1);

    const [watchdog] = bridge.state.watchdogs;

    assert.equal(watchdog.selector, "sel:abortModal");
    assert.ok(watchdog.delay > 0, "a watchdog with no delay would fire at once");
    // The default run loop mode does not tick while a modal owns the thread,
    // so a watchdog scheduled there would never fire.
    assert.deepEqual(watchdog.modes, { boxed: ["NSModalPanelRunLoopMode"] });
});

test("the alert carries the form's own title, detail and buttons", () => {
    const spec = formSpec(defaultAnswers(), [
        { key: "dpi", message: "something was wrong" }
    ]);
    const { bridge } = present([CREATE], spec);
    const [alert] = bridge.state.alerts;

    assert.equal(alert.messageText, spec.title);
    assert.equal(alert.informativeText, "something was wrong");
    assert.deepEqual(alert.buttons, ["Create PDF", "Cancel"]);
    assert.ok(alert.accessoryView, "the form must be attached to the alert");
    assert.equal(alert.accessoryView.kind, "view");
});

test("the current answers are preselected rather than left at the top", () => {
    // A redisplayed form that resets every popup would lose the answers it
    // exists to preserve.
    const answers = { ...defaultAnswers(), paperSize: "US Letter", dpi: "600" };
    const { bridge } = present([CREATE], formSpec(answers, [
        { key: "dpi", message: "fix the DPI" }
    ]));
    const view = bridge.state.alerts[0].accessoryView;
    const popups = view.subviews.filter((child) => child.kind === "popup");
    const fields = view.subviews.filter((child) => child.kind === "field");

    assert.ok(popups.some((popup) => popup.selected === "US Letter"));
    assert.ok(fields.some((field) => field.stringValue === "600"));
});

test("edited values come back out, not the values that went in", () => {
    const bridge = createFakeObjC({ responses: [CREATE] });
    const spec = formSpec();

    // Stand in for a person changing the form before clicking Create.
    const original = bridge.ns.NSPopUpButton.alloc.initWithFramePullsDown;

    bridge.ns.NSPopUpButton.alloc.initWithFramePullsDown = (rect, pullsDown) => {
        const popup = original(rect, pullsDown);
        const select = popup.selectItemWithTitle;

        popup.selectItemWithTitle = (title) => select(
            title === "A4" ? "US Letter" : title
        );

        return popup;
    };

    const outcome = presentForm(bridge, spec);

    assert.equal(outcome.answers.paperSize, "US Letter");
});
