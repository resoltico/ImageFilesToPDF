"use strict";

const {
    makeView,
    makeLabel,
    makeHint,
    makePopup,
    addPopupItem,
    markInvalid,
    markHintInvalid,
    makeAlert
} = require("./appkit-widgets.js");
const { makeField, makeColourCombo } = require("./appkit-fields.js");
const { buildForm } = require("./appkit-form.js");

// Gathered into one object so a test can substitute the whole widget layer.
const WIDGETS = {
    makeView,
    makeLabel,
    makeHint,
    makePopup,
    addPopupItem,
    makeField,
    makeColourCombo,
    markInvalid,
    markHintInvalid,
    makeAlert
};

/*
 * One window instead of six sequential prompts.
 *
 * The ObjC namespace and the widget primitives are both parameters, so the
 * composition here — which rows become which controls, and what comes back
 * out of them — is unit tested against fakes. Only appkit-widgets.js touches
 * AppKit for real.
 *
 * A form that never appears would leave the user with nothing, so runModal is
 * guarded by an abortModal watchdog and an abort is reported as "could not
 * present" rather than as an answer. The caller then falls back to the
 * stepwise dialogs, which need no AppKit at all.
 */

/*
 * Long enough that nobody filling in six fields is cut off, short enough that
 * a form which never rendered does not look like a hang forever. Reaching it
 * costs one slow run and then the dialogs appear instead.
 */

/*
 * A modal that ends any other way than by one of its buttons is one this code
 * did not ask for, and the form is treated as unavailable so the stepwise
 * dialogs can ask instead.
 *
 * There used to be a watchdog here: an abortModal scheduled two minutes out,
 * so a form that never returned could not hang the run. It fired on forms
 * that were working perfectly, because taking two minutes to choose a paper
 * size and a colour is not evidence of anything -- and the user was dropped
 * into the stepwise dialogs half way through answering. Measured, not
 * assumed: abortModal yields NSModalResponseAbort, which is -1001, and -1000
 * is NSModalResponseStop.
 */
const RESPONSE_ABORT = -1001;
const FIRST_BUTTON = 1000;

function readControls(bridge, spec, controls) {
    const answers = {};

    for (const row of spec.rows) {
        const control = controls[row.key];

        if (row.kind !== "choice") {
            /*
             * What is being typed lives in the window's field editor until
             * something commits it, and stringValue is what was last
             * committed. Clicking a button usually ends editing first, which
             * is not the same as always: a value typed and submitted without
             * leaving the field would otherwise be read as the one before it.
             * validateEditing copies the editor's contents into the cell, and
             * is documented to do exactly that.
             *
             * A zero-argument ObjC method, which JXA invokes on property
             * access -- written with parentheses it would call the result.
             */
            // eslint-disable-next-line no-unused-expressions
            control.validateEditing;
        }

        answers[row.key] = String(bridge.objc.unwrap(
            row.kind === "choice"
                ? control.titleOfSelectedItem
                : control.stringValue
        ));
    }

    return answers;
}

function presentForm(bridge, spec, widgets = WIDGETS) {
    const { view, controls } = buildForm(bridge, spec, widgets);
    const alert = widgets.makeAlert(bridge.ns, spec);

    alert.accessoryView = view;

    const response = Number(alert.runModal);

    if (response === RESPONSE_ABORT) {
        return null;
    }

    return response === FIRST_BUTTON
        ? { answers: readControls(bridge, spec, controls) }
        : { cancelled: true };
}

module.exports = { presentForm, WIDGETS };
