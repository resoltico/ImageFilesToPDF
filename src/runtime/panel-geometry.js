"use strict";

/*
 * Where the three things in the progress panel sit.
 *
 * One fixed-size window with a headline, a detail line and a bar, laid out in
 * AppKit's bottom-left coordinate space from a top-down description: padding,
 * headline, gap, detail, gap, bar, padding. Stated as arithmetic so the rects
 * can be checked against each other rather than eyeballed against a screenshot
 * nothing here can take.
 *
 * The panel does not resize. A window that grows a bar when the total becomes
 * known would move under the eye of somebody already reading it, so the bar's
 * room is reserved from the start and the bar itself is hidden until there is
 * a total to draw.
 */

const PANEL_WIDTH = 420;
const PADDING_X = 18;
const PADDING_Y = 16;
const HEADLINE_HEIGHT = 18;
const DETAIL_HEIGHT = 16;
const BAR_HEIGHT = 6;

// Tight under the headline, because they are one statement in two voices; the
// bar is a separate thing and is spaced like one.
const HEADLINE_GAP = 4;
const BAR_GAP = 12;

// Padding sits at both edges, and the bar is as round as it is tall.
const EDGES = 2;
const BAR_RADIUS = BAR_HEIGHT / EDGES;

const CONTENT_WIDTH = PANEL_WIDTH - PADDING_X * EDGES;

const PANEL_HEIGHT = PADDING_Y * EDGES +
    HEADLINE_HEIGHT + HEADLINE_GAP + DETAIL_HEIGHT + BAR_GAP + BAR_HEIGHT;

const HEADLINE_BOTTOM = PANEL_HEIGHT - PADDING_Y - HEADLINE_HEIGHT;
const DETAIL_BOTTOM = HEADLINE_BOTTOM - HEADLINE_GAP - DETAIL_HEIGHT;
const BAR_BOTTOM = DETAIL_BOTTOM - BAR_GAP - BAR_HEIGHT;

function row(bottom, height, width = CONTENT_WIDTH) {
    return { left: PADDING_X, bottom, width, height };
}

const PANEL_RECT = Object.freeze({
    left: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT
});

const HEADLINE_RECT = Object.freeze(row(HEADLINE_BOTTOM, HEADLINE_HEIGHT));
const DETAIL_RECT = Object.freeze(row(DETAIL_BOTTOM, DETAIL_HEIGHT));
const TRACK_RECT = Object.freeze(row(BAR_BOTTOM, BAR_HEIGHT));

/*
 * How much of the track is filled.
 *
 * A total of zero is not a full bar and not an error: it is a run whose size
 * is not known yet, which is every moment before the images have been counted.
 * Nothing finished out of nothing done is nothing drawn.
 */
function fillRect(done, total) {
    const fraction = total > 0 ? Math.min(done / total, 1) : 0;

    return row(BAR_BOTTOM, BAR_HEIGHT, CONTENT_WIDTH * fraction);
}

module.exports = {
    BAR_RADIUS,
    PANEL_RECT,
    HEADLINE_RECT,
    DETAIL_RECT,
    TRACK_RECT,
    fillRect
};
