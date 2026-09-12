"use strict";

/*
 * What is done to the panel once it exists, and what has to be true of the
 * process before it can exist at all.
 *
 * The activation policy is the reason this round is not simply "add a
 * window". A prohibited application cannot order one front; it can still run
 * a modal session, which is why the settings form displays inside Shortcuts
 * and why the form's success said nothing about a panel.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    PAINT_SECONDS,
    POLICY_ACCESSORY,
    POLICY_PROHIBITED,
    policyOf,
    setPolicy,
    allowWindows,
    paint,
    show,
    hide,
    closeWindow,
    setFrame,
    setHidden
} = require("../../../src/runtime/panel-window.js");
const { TRACK_RECT } = require("../../../src/runtime/panel-geometry.js");
const { createFakeObjC } = require("./fake-objc.cjs");

function panelOf(ns) {
    return ns.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer(
        TRACK_RECT,
        0,
        0,
        false
    );
}

test("a prohibited process is raised only as far as accessory", () => {
    // Accessory shows no Dock icon and no menu bar. Regular is the one that
    // would put an icon up in the middle of somebody's work, and nothing
    // here can reach it.
    const { ns, state } = createFakeObjC({ policy: POLICY_PROHIBITED });

    allowWindows(ns);

    assert.deepEqual(state.policies, [POLICY_ACCESSORY]);
});

test("a process that can already show a window is left alone", () => {
    const { ns, state } = createFakeObjC({ policy: POLICY_ACCESSORY });

    allowWindows(ns);

    assert.deepEqual(state.policies, [], "nothing was changed");
});

test("the policy is put back the way it was found", () => {
    for (const policy of [POLICY_PROHIBITED, POLICY_ACCESSORY]) {
        const { ns, state } = createFakeObjC({ policy });

        allowWindows(ns)();

        assert.equal(state.policies.at(-1), policy, `restored to ${policy}`);
        assert.equal(policyOf(ns), policy);
    }
});

test("the policy is read and written through the shared application", () => {
    const { ns, state } = createFakeObjC({ policy: POLICY_PROHIBITED });

    assert.equal(policyOf(ns), POLICY_PROHIBITED);
    setPolicy(ns, POLICY_ACCESSORY);
    assert.deepEqual(state.policies, [POLICY_ACCESSORY]);
});

test("the panel is ordered front without being activated", () => {
    // orderFrontRegardless, never activateIgnoringOtherApps: this process is
    // not frontmost and must not become frontmost to say what it is doing.
    const { ns } = createFakeObjC();
    const panel = panelOf(ns);

    show(panel);

    assert.deepEqual(panel.done, ["orderFrontRegardless"]);
});

test("drawing is synchronous, and then the run loop is pumped once", () => {
    // -[NSWindow display] draws now rather than marking the view dirty and
    // waiting for a pass that may never come, because nothing here returns to
    // a run loop between one shell command and the next.
    const { ns, state } = createFakeObjC();
    const panel = panelOf(ns);

    paint(ns, panel);

    assert.deepEqual(panel.done, ["display"]);
    assert.equal(state.pumped.length, 1);
    assert.equal(
        state.pumped[0].mode,
        "NSModalPanelRunLoopMode",
        "not the default mode, which is where another Apple Event would arrive"
    );
    assert.equal(state.pumped[0].until.seconds, PAINT_SECONDS);
});

test("the pump is bounded, and short enough to disappear into a conversion", () => {
    assert.ok(PAINT_SECONDS > 0, "a pump of nothing composites nothing");
    assert.ok(PAINT_SECONDS <= 0.05, `${PAINT_SECONDS}s per report is too long`);
});

test("hiding and closing are two different things", () => {
    // A paused report is hidden and comes back. A closed one does not.
    const { ns } = createFakeObjC();
    const panel = panelOf(ns);

    hide(panel);
    closeWindow(panel);

    assert.deepEqual(panel.done, ["orderOut:null", "close"]);
});

test("a box is resized by its frame and shown by its flag", () => {
    const { ns } = createFakeObjC();
    const box = ns.NSBox.alloc.initWithFrame(TRACK_RECT);

    setFrame(ns, box, { ...TRACK_RECT, width: 7 });
    assert.equal(box.frame.width, 7);

    setHidden(box, true);
    assert.equal(box.hidden, true);
    setHidden(box, false);
    assert.equal(box.hidden, false);
});
