"use strict";

/*
 * Turning the form description from src/core/form.js into a view.
 *
 * Split from appkit.js so that laying the rows out and presenting the result
 * stay separately readable, and so neither file exceeds the size the gate
 * allows. The widget primitives arrive as a parameter, which is what lets
 * this be tested without AppKit.
 */

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
const CONTROL_HEIGHT = 24;
const HINT_HEIGHT = 16;
const GAP = 10;
const HINT_GAP = 8;
const PADDING = 6;

// Padding sits above and below; a hint is centred against its field.
const BOTH_EDGES = 2;
const HALVES = 2;

const CONTROL_LEFT = LABEL_WIDTH + GAP;
const HINT_LEFT = CONTROL_LEFT + NUMBER_WIDTH + HINT_GAP;
const FORM_WIDTH = CONTROL_LEFT + CONTROL_WIDTH;
const HINT_WIDTH = FORM_WIDTH - HINT_LEFT;

function rowRect(index, rowCount, left, width) {
    return {
        left,
        bottom: PADDING + (rowCount - index - 1) * ROW_HEIGHT,
        width,
        height: CONTROL_HEIGHT
    };
}

function addChoice(context, row, rect) {
    const { ns, widgets, view } = context;
    const popup = widgets.makePopup(ns, rect);

    for (const option of row.options) {
        widgets.addPopupItem(popup, option);
    }

    popup.selectItemWithTitle(row.value);
    view.addSubview(popup);

    if (row.invalid) {
        widgets.markInvalid(ns, popup);
    }

    return popup;
}

/*
 * The one control that is a list and a field at once, so the presets stay
 * available without a second control to keep in step with them. It takes the
 * whole control column: the guidance that a number row shows beside itself is
 * the combo box's tooltip instead.
 */
function addColour(context, row, rect) {
    const { ns, widgets, view } = context;
    const combo = widgets.makeColourCombo(ns, row, rect);

    view.addSubview(combo);

    if (row.invalid) {
        widgets.markInvalid(ns, combo);
    }

    return combo;
}

/*
 * The field is only as wide as the number it holds; the space that would have
 * been wasted carries the bounds instead.
 */
function addNumber(context, row, rect) {
    const { ns, widgets, view } = context;
    const field = widgets.makeField(ns, row.value, {
        ...rect,
        width: NUMBER_WIDTH
    });

    const hint = widgets.makeHint(ns, row.hint, {
        left: HINT_LEFT,
        bottom: rect.bottom + (CONTROL_HEIGHT - HINT_HEIGHT) / HALVES,
        width: HINT_WIDTH,
        height: HINT_HEIGHT
    });

    view.addSubview(field);
    view.addSubview(hint);

    if (row.invalid) {
        // The value and the rule it breaks, marked together.
        widgets.markInvalid(ns, field);
        widgets.markHintInvalid(ns, hint);
    }

    return field;
}

const ADD_ROW = {
    choice: addChoice,
    colour: addColour,
    number: addNumber
};

function buildForm(bridge, spec, widgets) {
    const rowCount = spec.rows.length;
    const view = widgets.makeView(
        bridge.ns,
        FORM_WIDTH,
        rowCount * ROW_HEIGHT + PADDING * BOTH_EDGES
    );
    const context = { ns: bridge.ns, widgets, view };
    const controls = {};

    spec.rows.forEach((row, index) => {
        view.addSubview(widgets.makeLabel(
            bridge.ns,
            row.label,
            rowRect(index, rowCount, 0, LABEL_WIDTH)
        ));

        const rect = rowRect(index, rowCount, CONTROL_LEFT, CONTROL_WIDTH);

        controls[row.key] = ADD_ROW[row.kind](context, row, rect);
    });

    return { view, controls };
}

module.exports = { FORM_WIDTH, ROW_HEIGHT, NUMBER_WIDTH, PADDING, buildForm };
