"use strict";

const {
    makeView,
    makeLabel,
    makeHint,
    makePopup,
    addPopupItem,
    makeField,
    markInvalid,
    markHintInvalid,
    makeAlert
} = require("./appkit-widgets.js");
const { buildForm } = require("./appkit-form.js");

// Gathered into one object so a test can substitute the whole widget layer.
const WIDGETS = {
    makeView,
    makeLabel,
    makeHint,
    makePopup,
    addPopupItem,
    makeField,
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
const WATCHDOG_SECONDS = 120;

// Measured, not assumed: abortModal yields NSModalResponseAbort, which is
// -1001. -1000 is NSModalResponseStop and is not what fires here.
const RESPONSE_ABORT = -1001;
const FIRST_BUTTON = 1000;

function readControls(bridge, spec, controls) {
    const answers = {};

    for (const row of spec.rows) {
        const control = controls[row.key];

        answers[row.key] = String(bridge.objc.unwrap(
            row.kind === "choice"
                ? control.titleOfSelectedItem
                : control.stringValue
        ));
    }

    return answers;
}

/*
 * The watchdog runs in NSModalPanelRunLoopMode because the default mode does
 * not tick while a modal loop owns the thread.
 */
function armWatchdog(bridge, application) {
    application.performSelectorWithObjectAfterDelayInModes(
        bridge.ns.NSSelectorFromString("abortModal"),
        null,
        WATCHDOG_SECONDS,
        bridge.ns([bridge.ns.NSModalPanelRunLoopMode])
    );
}

function presentForm(bridge, spec, widgets = WIDGETS) {
    const application = bridge.ns.NSApplication.sharedApplication;
    const { view, controls } = buildForm(bridge, spec, widgets);
    const alert = widgets.makeAlert(bridge.ns, spec);

    alert.accessoryView = view;
    armWatchdog(bridge, application);

    const response = Number(alert.runModal);

    if (response === RESPONSE_ABORT) {
        return null;
    }

    return response === FIRST_BUTTON
        ? { answers: readControls(bridge, spec, controls) }
        : { cancelled: true };
}

module.exports = { presentForm };
