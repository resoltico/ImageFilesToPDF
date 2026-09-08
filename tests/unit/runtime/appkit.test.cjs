"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { presentForm } = require("../../../src/runtime/appkit.js");
const { formSpec, defaultAnswers } = require("../../../src/core/form.js");
const { createFakeObjC } = require("./fake-objc.cjs");

const CREATE = 1000;
const CANCEL = 1001;
const ABORT = -1001;

function present(responses, spec, duringModal) {
    const bridge = createFakeObjC({ responses, duringModal });

    return { bridge, outcome: presentForm(bridge, spec ?? formSpec()) };
}

/*
 * The labels and hints are NSTextFields too, so a control is picked out by
 * what it holds rather than by being the only one of its kind.
 */
function controlsIn(alert) {
    const views = alert.accessoryView.subviews;

    return {
        combo: views.find((view) => view.kind === "combo"),
        popup: views.find((view) => view.kind === "popup"),
        resolution: views.find(
            (view) => view.kind === "field" && view.stringValue === "300"
        )
    };
}

test("clicking Create returns what the controls hold", () => {
    const { outcome } = present([CREATE]);

    assert.deepEqual(outcome.answers, defaultAnswers());
    assert.equal(outcome.cancelled, undefined);
});

test("a colour typed over a preset is the answer, not the preset", () => {
    // Selecting White and then replacing its text is the whole point of the
    // control. Reading the item last selected from the list would take the
    // preset and discard what the person actually wrote.
    const { outcome } = present([CREATE], formSpec(), (alert) => {
        controlsIn(alert).combo.stringValue = "  c7dae8 ";
    });

    assert.equal(outcome.answers.background, "  c7dae8 ");
});

test("what is being typed is committed before it is read", () => {
    // Text lives in the window's field editor until something commits it, and
    // stringValue is what was last committed. A value typed and submitted
    // without leaving the field would otherwise read as the one before it.
    const { bridge } = present([CREATE]);
    const { combo, resolution, popup } = controlsIn(bridge.state.alerts[0]);

    assert.ok(combo.committed > 0, "the colour");
    assert.ok(resolution.committed > 0, "and the numbers, which had the same fault");
    assert.equal(popup.committed, 0, "a menu has no editor to commit");
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

test("nothing is scheduled against the form, and nothing ends it early", () => {
    // There was a watchdog here: an abortModal two minutes out, so a form that
    // never returned could not hang the run. It fired on forms that were
    // working perfectly -- taking two minutes to choose a paper size and a
    // colour is not evidence of anything -- and dropped the user into the
    // stepwise dialogs half way through answering. Nothing replaced it,
    // deliberately: the form ends when it is answered or cancelled.
    const { bridge } = present([CREATE]);

    assert.deepEqual(bridge.state.watchdogs, []);
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

