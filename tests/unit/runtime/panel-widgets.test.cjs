"use strict";

/*
 * The AppKit objects the progress panel is made of.
 *
 * No headless test can prove AppKit drew any of this. What is checked is that
 * each object is asked for with the properties the panel depends on -- and
 * two of those are load-bearing in a way that is invisible from a screenshot:
 * a utility panel that does not clear hidesOnDeactivate is built, ordered
 * front and hidden again, and a non-activating mask is the difference between
 * saying what the run is doing and taking the machine over while it does it.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    PANEL_STYLE,
    perform,
    rectOf,
    makePanel,
    makeContent,
    makeHeadline,
    makeDetail,
    makeBar
} = require("../../../src/runtime/panel-widgets.js");
const { PANEL_RECT, TRACK_RECT } = require("../../../src/runtime/panel-geometry.js");
const { createFakeObjC } = require("./fake-objc.cjs");

const STYLE_TITLED = 1;
const STYLE_UTILITY = 16;
const STYLE_NONACTIVATING = 128;

test("the style mask is titled, utility and non-activating, and nothing else", () => {
    // Written as a sum of the three bits it is meant to be. A closable panel
    // would let somebody dismiss the report without stopping the work.
    assert.equal(PANEL_STYLE, STYLE_TITLED + STYLE_UTILITY + STYLE_NONACTIVATING);
});

test("the panel cannot take focus, cannot be clicked, and stays visible", () => {
    const { ns } = createFakeObjC();
    const panel = makePanel(ns, PANEL_RECT, "Image Files to PDF");

    assert.equal(panel.styleMask, PANEL_STYLE);
    assert.equal(panel.title, "Image Files to PDF");
    assert.equal(panel.level, 3, "NSFloatingWindowLevel");
    assert.equal(
        panel.hidesOnDeactivate,
        false,
        "a utility panel hides itself when its app is not active, and this one's never is"
    );
    assert.equal(panel.becomesKeyOnlyIfNeeded, true);
    assert.equal(panel.ignoresMouseEvents, true, "it is a display, not a control");
    assert.equal(
        panel.releasedWhenClosed,
        false,
        "JXA holds the reference; an over-release is a crash with no dialog"
    );
    assert.deepEqual(panel.done, ["center"], "centred, and nothing else done to it yet");
});

test("the panel is asked for at the size the layout describes", () => {
    const { ns } = createFakeObjC();
    const panel = makePanel(ns, PANEL_RECT, "x");

    assert.deepEqual(panel.rect, PANEL_RECT);
    assert.deepEqual(rectOf(ns, TRACK_RECT), TRACK_RECT);
    assert.equal(panel.backing, 2, "NSBackingStoreBuffered");
    assert.equal(panel.defer, false);
});

test("both lines are labels: not editable, not selectable, no background", () => {
    const { ns } = createFakeObjC();

    for (const make of [makeHeadline, makeDetail]) {
        const text = make(ns, TRACK_RECT);

        assert.equal(text.stringValue, "", "nothing to say yet");
        assert.equal(text.editable, false);
        assert.equal(text.selectable, false);
        assert.equal(text.bezeled, false);
        assert.equal(text.drawsBackground, false);
        assert.equal(text.lineBreakMode, 4, "NSLineBreakByTruncatingTail");
    }
});

test("the headline is the louder of the two lines", () => {
    const { ns } = createFakeObjC();
    const headline = makeHeadline(ns, TRACK_RECT);
    const detail = makeDetail(ns, TRACK_RECT);

    assert.equal(headline.font.bold, true);
    assert.ok(headline.font.size > detail.font.size, "and the larger");
    assert.equal(headline.textColor.name, "label");
    assert.equal(detail.textColor.name, "secondaryLabel", "the quieter colour");
});

test("the bar is a filled box with no border and no title", () => {
    // Not an NSProgressIndicator: its animation machinery would need a run
    // loop to tick, and nothing here pumps one on its behalf.
    const { ns } = createFakeObjC();
    const box = makeBar(ns, TRACK_RECT, ns.NSColor.separatorColor);

    assert.equal(box.boxType, 4, "NSBoxCustom");
    assert.equal(box.borderType, 0, "NSNoBorder");
    assert.equal(box.borderWidth, 0);
    assert.equal(box.titlePosition, 0, "NSNoTitle");
    assert.equal(box.fillColor.name, "separator");
    assert.equal(box.cornerRadius, TRACK_RECT.height / 2, "as round as it is tall");
});

test("a zero-argument ObjC method is performed, not described", () => {
    // JXA invokes them on property access. Written with parentheses it would
    // call whatever the method returned.
    const calls = [];
    const target = {};

    Object.defineProperty(target, "close", { get: () => calls.push("close") });
    perform(target, "close");

    assert.deepEqual(calls, ["close"]);
});

test("the content view is as big as the panel", () => {
    const { ns } = createFakeObjC();

    assert.deepEqual(makeContent(ns, PANEL_RECT).rect, PANEL_RECT);
});
