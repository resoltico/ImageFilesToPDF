"use strict";

/*
 * Where the three things in the progress panel sit. AppKit's origin is the
 * bottom left, and a layout described top-down has to be turned round to get
 * there -- which is how the settings form once came out upside down.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    PANEL_RECT,
    HEADLINE_RECT,
    DETAIL_RECT,
    TRACK_RECT,
    fillRect
} = require("../../../src/runtime/panel-geometry.js");

function top(rect) {
    return rect.bottom + rect.height;
}

test("the rows are stacked in reading order, headline first", () => {
    // In AppKit coordinates that means descending, which is the half of this
    // that is easy to get backwards.
    assert.ok(top(HEADLINE_RECT) > top(DETAIL_RECT), "headline above detail");
    assert.ok(top(DETAIL_RECT) > top(TRACK_RECT), "detail above the bar");
});

test("nothing overlaps and nothing leaves the panel", () => {
    const rows = [HEADLINE_RECT, DETAIL_RECT, TRACK_RECT];

    for (const rect of rows) {
        assert.ok(rect.bottom >= 0, "inside the bottom edge");
        assert.ok(top(rect) <= PANEL_RECT.height, "inside the top edge");
        assert.ok(rect.left > 0, "padded from the left edge");
        assert.ok(rect.left + rect.width < PANEL_RECT.width, "and from the right");
    }

    assert.ok(HEADLINE_RECT.bottom >= top(DETAIL_RECT), "no overlap");
    assert.ok(DETAIL_RECT.bottom >= top(TRACK_RECT), "no overlap");
});

test("the panel is padded equally above and below", () => {
    // The bar's room is reserved whether or not there is a total to draw in
    // it, because a window that grows one moves under the eye reading it.
    assert.equal(
        PANEL_RECT.height - top(HEADLINE_RECT),
        TRACK_RECT.bottom,
        "the space above the headline is the space below the bar"
    );
});

test("the fill runs from nothing to the whole track", () => {
    assert.equal(fillRect(0, 4).width, 0, "nothing done");
    assert.equal(fillRect(2, 4).width, TRACK_RECT.width / 2, "half done");
    assert.equal(fillRect(4, 4).width, TRACK_RECT.width, "all of it");
});

test("the fill sits exactly on the track", () => {
    const filled = fillRect(1, 4);

    assert.equal(filled.left, TRACK_RECT.left);
    assert.equal(filled.bottom, TRACK_RECT.bottom);
    assert.equal(filled.height, TRACK_RECT.height);
});

test("a total nobody knows yet is not a full bar", () => {
    // Every report before the images have been counted arrives with a total
    // of zero. Dividing by it would be a bar drawn full, or drawn at NaN.
    assert.equal(fillRect(0, 0).width, 0);
    assert.equal(fillRect(3, 0).width, 0);
});

test("a count past the total does not run off the end of the track", () => {
    assert.equal(fillRect(9, 4).width, TRACK_RECT.width);
});
