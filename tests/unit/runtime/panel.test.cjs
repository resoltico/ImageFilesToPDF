"use strict";

/*
 * What the panel is built from, when it appears, and what it says.
 *
 * No headless test can prove AppKit put anything on screen -- every check
 * below passes against a fake that renders nothing. What they establish is
 * that the window was asked for, ordered front at the right moment and closed
 * again. Whether a Shortcut shows it is the one thing left, and QA.md says
 * how to find out by hand.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    APPEARANCE_DELAY,
    build,
    panelSink
} = require("../../../src/runtime/panel.js");
const { TRACK_RECT } = require("../../../src/runtime/panel-geometry.js");
const { createFakeObjC } = require("./fake-objc.cjs");

/*
 * A panel with a clock a test drives by hand, so the appearance delay is
 * exercised without anything waiting for real time to pass.
 */
function opened(options = {}) {
    const { ns, state } = createFakeObjC(options);
    const view = build(ns);
    const now = { at: 0 };
    const restored = [];
    const sink = panelSink(view, ns, () => now.at, () => restored.push("restored"));

    return { ns, state, view, now, restored, sink };
}

test("the panel holds a headline, a detail line and a bar, in one view", () => {
    const { view } = opened();

    assert.deepEqual(
        view.panel.contentView.subviews.map((part) => part.kind),
        ["field", "field", "box", "box"],
        "two lines of text, then the track and the fill over it"
    );
    assert.equal(
        view.panel.contentView.subviews.at(-1),
        view.fill,
        "the fill is added last, so it draws over the track"
    );
});

test("the bar is hidden until there is a total to draw in it", () => {
    // Every report before the images have been counted arrives with a total
    // of zero. A bar drawn empty then says none of a known quantity is done;
    // what is true is that the quantity is not known.
    const { view, sink } = opened();

    assert.equal(view.track.hidden, true);
    assert.equal(view.fill.hidden, true);

    sink.start(4);

    assert.equal(view.track.hidden, false);
    assert.equal(view.fill.hidden, false);
});

test("a run that is over quickly never puts a window up", () => {
    const { view, now, sink } = opened();

    sink.start(4);
    now.at = APPEARANCE_DELAY - 1;
    sink.report(1, "Preparing", "1 of 4 — x.png");

    assert.deepEqual(view.panel.done, ["center"], "built and centred, not shown");
});

test("the window appears once the run has been going long enough", () => {
    const { state, view, now, sink } = opened();

    sink.start(4);
    now.at = APPEARANCE_DELAY;
    sink.report(1, "Preparing", "1 of 4 — x.png");

    assert.deepEqual(view.panel.done, ["center", "orderFrontRegardless", "display"]);
    assert.equal(state.pumped.length, 1, "drawn, then pumped once");
});

test("a report reaches both lines and the bar whether or not it is shown", () => {
    // The window may appear halfway through a run, and what it appears saying
    // has to be what is happening then, not what was happening when it was
    // last drawn.
    const { view, now, sink } = opened();

    sink.start(4);
    sink.report(2, "Preparing", "3 of 4 — y.png");

    assert.equal(view.headline.stringValue, "Preparing");
    assert.equal(view.detail.stringValue, "3 of 4 — y.png");
    assert.equal(view.fill.frame.width, TRACK_RECT.width / 2, "two of four");
    assert.deepEqual(view.panel.done, ["center"], "and still not on screen");

    now.at = APPEARANCE_DELAY;
    sink.report(4, "Saved", "4 of 4 — z.png");

    assert.equal(view.fill.frame.width, TRACK_RECT.width);
});

function shown(view) {
    return view.panel.done.filter((step) => step === "orderFrontRegardless").length;
}

test("pausing takes the window away", () => {
    // The settings form is about to be answered, and a modal alert sits below
    // a floating panel.
    const { view, now, sink } = opened();

    now.at = APPEARANCE_DELAY;
    sink.report(1, "Preparing", "1 of 4 — x.png");
    sink.pause();

    assert.equal(view.panel.done.at(-1), "orderOut:null");
});

test("pausing starts the delay again", () => {
    // A conversion quick enough to need no window must not get one merely
    // because the person took a while over the settings.
    const { view, now, sink } = opened();

    now.at = APPEARANCE_DELAY;
    sink.report(1, "Preparing", "1 of 4 — x.png");
    sink.pause();

    now.at += APPEARANCE_DELAY - 1;
    sink.report(2, "Preparing", "2 of 4 — y.png");
    assert.equal(shown(view), 1, "not shown again yet");

    now.at += 1;
    sink.report(3, "Preparing", "3 of 4 — z.png");
    assert.equal(shown(view), 2);
});

test("closing takes the window away, closes it, and puts the process back", () => {
    const { view, restored, sink } = opened();

    sink.close();

    assert.deepEqual(view.panel.done, ["center", "orderOut:null", "close"]);
    assert.deepEqual(restored, ["restored"]);
});
