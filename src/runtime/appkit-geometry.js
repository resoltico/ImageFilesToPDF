"use strict";

/*
 * Three columns: the name of the setting, the control, and — for the two that
 * take a number — the bounds it accepts.
 *
 * Widths were measured rather than guessed. At the 13 point system font the
 * longest label renders 110 points wide and the longest menu item 187, so a
 * number field needs only enough room for four digits and the rest of its
 * column can carry the hint.
 */
const ROW_HEIGHT = 32;
const LABEL_WIDTH = 140;
const CONTROL_WIDTH = 230;
const NUMBER_WIDTH = 70;

// Room for a colour and the button that opens the list beside it. Wider than
// a number and far narrower than a menu of names, which is what the list held
// before its items became the colours themselves.
const COLOUR_WIDTH = 100;
const CONTROL_HEIGHT = 24;
const HINT_HEIGHT = 16;
const GAP = 10;
const HINT_GAP = 8;
const PADDING = 6;

// Padding sits above and below; a hint is centred against its field.
const BOTH_EDGES = 2;
const HALVES = 2;

const CONTROL_LEFT = LABEL_WIDTH + GAP;
const FORM_WIDTH = CONTROL_LEFT + CONTROL_WIDTH;

/*
 * A hint sits past the control it belongs to and stops at the edge of the
 * form. Derived from that control's width rather than from a fixed one: two
 * rows are typed into now, and they are not the same width.
 */
function hintRect(rect, controlWidth) {
    const left = CONTROL_LEFT + controlWidth + HINT_GAP;

    return {
        left,
        bottom: rect.bottom + (CONTROL_HEIGHT - HINT_HEIGHT) / HALVES,
        width: FORM_WIDTH - left,
        height: HINT_HEIGHT
    };
}

function rowRect(index, rowCount, left, width) {
    return {
        left,
        bottom: PADDING + (rowCount - index - 1) * ROW_HEIGHT,
        width,
        height: CONTROL_HEIGHT
    };
}

/*
 * The view the rows sit in: as wide as the form and as tall as it has rows,
 * with the padding above and below.
 */
function formSize(rowCount) {
    return {
        width: FORM_WIDTH,
        height: rowCount * ROW_HEIGHT + PADDING * BOTH_EDGES
    };
}

// The name of a setting, in the column before its control.
function labelRect(index, rowCount) {
    return rowRect(index, rowCount, 0, LABEL_WIDTH);
}

// The column a control is laid out in, whatever width it ends up taking.
function controlRect(index, rowCount) {
    return rowRect(index, rowCount, CONTROL_LEFT, CONTROL_WIDTH);
}

module.exports = {
    ROW_HEIGHT,
    PADDING,
    COLOUR_WIDTH,
    NUMBER_WIDTH,
    FORM_WIDTH,
    formSize,
    labelRect,
    controlRect,
    hintRect
};
