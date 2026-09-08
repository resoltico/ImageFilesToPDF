"use strict";

const {
    COLOUR_WIDTH,
    NUMBER_WIDTH,
    formSize,
    labelRect,
    controlRect,
    hintRect
} = require("./appkit-geometry.js");

/*
 * Turning the form description from src/core/form.js into a view.
 *
 * Split from appkit.js so that laying the rows out and presenting the result
 * stay separately readable, and so neither file exceeds the size the gate
 * allows. The widget primitives arrive as a parameter, which is what lets
 * this be tested without AppKit.
 */

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
 * A row that is typed into: the control, only as wide as what it holds, and
 * the space that would have been wasted carrying the rule it accepts.
 *
 * The colour row and the number rows differ in the control and in how wide it
 * is, and in nothing else -- so they differ here in the control and in how
 * wide it is, and in nothing else.
 */
function addTyped(context, row, rect, control) {
    const { ns, widgets, view } = context;
    const { width, make } = control;
    const field = make({ ...rect, width });
    const hint = widgets.makeHint(ns, row.hint, hintRect(rect, width));

    view.addSubview(field);
    view.addSubview(hint);

    if (row.invalid) {
        // The value and the rule it breaks, marked together.
        widgets.markInvalid(ns, field);
        widgets.markHintInvalid(ns, hint);
    }

    return field;
}

/*
 * The one control that is a list and a field at once, so the presets stay
 * available without a second control to keep in step with them.
 */
function addColour(context, row, rect) {
    return addTyped(context, row, rect, {
        width: COLOUR_WIDTH,
        make: (frame) => context.widgets.makeColourCombo(context.ns, row, frame)
    });
}

function addNumber(context, row, rect) {
    return addTyped(context, row, rect, {
        width: NUMBER_WIDTH,
        make: (frame) => context.widgets.makeField(context.ns, row.value, frame)
    });
}

const ADD_ROW = {
    choice: addChoice,
    colour: addColour,
    number: addNumber
};

function buildForm(bridge, spec, widgets) {
    const rowCount = spec.rows.length;
    const { width, height } = formSize(rowCount);
    const view = widgets.makeView(bridge.ns, width, height);
    const context = { ns: bridge.ns, widgets, view };
    const controls = {};

    spec.rows.forEach((row, index) => {
        view.addSubview(widgets.makeLabel(
            bridge.ns,
            row.label,
            labelRect(index, rowCount)
        ));

        controls[row.key] = ADD_ROW[row.kind](
            context,
            row,
            controlRect(index, rowCount)
        );
    });

    return { view, controls };
}

module.exports = { buildForm };
