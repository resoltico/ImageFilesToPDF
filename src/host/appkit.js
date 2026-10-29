"use strict";

const ROW_HEIGHT = 32;
const LABEL_WIDTH = 140;
const CONTROL_WIDTH = 320;
const NUMBER_WIDTH = 70;

// Preset captions and editable custom hex share one control.
const COLOUR_WIDTH = 190;
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

const HINT_FONT_SIZE = 11;

// A tint rather than a solid fill, and drawn from the system red so it
// follows the appearance the alert is rendered in. A fixed pink would be
// wrong the moment the form appears in dark mode.
const INVALID_TINT_ALPHA = 0.18;

// NSTextAlignmentRight. On macOS right is 1 and centre is 2, which is the
// reverse of UIKit, so the constant is named rather than written inline.
const ALIGN_RIGHT = 1;

// NSLineBreakByTruncatingTail: a label too long for its column ends in an
// ellipsis instead of being cut mid-word. Clipping is how "JPEG quality
// (1-100, 90-95" reached a user looking like an unclosed parenthesis.
const TRUNCATE_TAIL = 4;

function makeView(ns, width, height) {
    return ns.NSView.alloc.initWithFrame(ns.NSMakeRect(0, 0, width, height));
}

function makeLabel(ns, text, rect) {
    const label = ns.NSTextField.alloc.initWithFrame(
        ns.NSMakeRect(rect.left, rect.bottom, rect.width, rect.height)
    );

    label.stringValue = text;
    label.editable = false;
    label.bezeled = false;
    label.drawsBackground = false;
    label.selectable = false;
    // Right against the controls, which is how a macOS form associates a
    // name with the thing it names.
    label.alignment = ALIGN_RIGHT;
    label.lineBreakMode = TRUNCATE_TAIL;

    return label;
}

function makeHint(ns, text, rect) {
    const hint = ns.NSTextField.alloc.initWithFrame(
        ns.NSMakeRect(rect.left, rect.bottom, rect.width, rect.height)
    );

    hint.stringValue = text;
    hint.editable = false;
    hint.bezeled = false;
    hint.drawsBackground = false;
    hint.selectable = false;
    hint.font = ns.NSFont.systemFontOfSize(HINT_FONT_SIZE);
    hint.textColor = ns.NSColor.secondaryLabelColor;
    hint.lineBreakMode = TRUNCATE_TAIL;

    return hint;
}

function makePopup(ns, rect) {
    return ns.NSPopUpButton.alloc.initWithFramePullsDown(
        ns.NSMakeRect(rect.left, rect.bottom, rect.width, rect.height),
        false
    );
}

function addPopupItem(popup, option) {
    popup.addItemWithTitle(option.label);

    popup.lastItem.representedObject = option.value;
    return popup.lastItem;
}

function markInvalid(ns, control) {
    control.drawsBackground = true;
    control.backgroundColor = ns.NSColor.systemRedColor
        .colorWithAlphaComponent(INVALID_TINT_ALPHA);
}

function markHintInvalid(ns, hint) {
    hint.textColor = ns.NSColor.systemRedColor;
}

function makeAlert(ns, spec) {
    const alert = ns.NSAlert.alloc.init;

    alert.messageText = spec.title;
    alert.informativeText = spec.detail;

    for (const button of spec.buttons) {
        alert.addButtonWithTitle(button);
    }

    return alert;
}

function makeField(ns, text, rect) {
    const field = ns.NSTextField.alloc.initWithFrame(
        ns.NSMakeRect(rect.left, rect.bottom, rect.width, rect.height)
    );

    field.stringValue = text;

    return field;
}

function makeColourCombo(ns, row, rect) {
    const combo = ns.NSComboBox.alloc.initWithFrame(
        ns.NSMakeRect(rect.left, rect.bottom, rect.width, rect.height)
    );

    combo.usesDataSource = false;
    combo.editable = true;
    combo.completes = false;
    combo.numberOfVisibleItems = row.options.length;
    combo.addItemsWithObjectValues(
        ns(row.options.map((option) => option.label))
    );
    combo.stringValue = row.value;
    combo.setAccessibilityLabel(row.label);

    return combo;
}

const { DETAIL_HEIGHT } = require("./details-dialog.js");

function addChoice(context, row, rect) {
    const { ns, widgets, view } = context;
    const popup = widgets.makePopup(ns, rect);

    for (const option of row.options) {
        widgets.addPopupItem(popup, option);
    }

    popup.selectItemAtIndex(row.options.findIndex((option) => option.value === row.value));
    view.addSubview(popup);

    if (row.invalid) {
        widgets.markInvalid(ns, popup);
    }

    return popup;
}

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

const DETAIL_GAP = 10;

const FORM_ACTIONS_CLASS = "ImageFilesToPDFSettingsActions";

function modeController(bridge, built, spec) {
    const { ns, objc } = bridge;
    let controllerClass = ns.NSClassFromString(FORM_ACTIONS_CLASS);
    if (!controllerClass || controllerClass.isNil()) {
        objc.registerSubclass({ name: FORM_ACTIONS_CLASS, superclass: "NSViewController", methods: {
            "modeChanged:": { types: ["void", ["id"]], implementation(sender) {
                const state = this.representedObject;
                const mode = sender.selectedItem.representedObject;
                state.objectForKey("details").string = state.objectForKey("texts").objectForKey(mode);
            } }
        } });
        controllerClass = ns.NSClassFromString(FORM_ACTIONS_CLASS);
    }
    const controller = controllerClass.alloc.init;
    controller.representedObject = ns({ details: built.details.documentView, texts: spec.summaryDetails });
    built.controls.mode.target = controller;
    built.controls.mode.action = ns.NSSelectorFromString("modeChanged:");
    return controller;
}


function buildForm(bridge, spec, widgets) {
    const rowCount = spec.rows.length;
    const { width, height } = formSize(rowCount);
    const view = widgets.makeView(bridge.ns, width, height + DETAIL_HEIGHT + DETAIL_GAP);
    const details = widgets.makeDetails(bridge.ns, spec.fullDetail, {
        left: 0, bottom: height + DETAIL_GAP, width, height: DETAIL_HEIGHT
    });
    view.addSubview(details);
    const context = { ns: bridge.ns, widgets, view };
    const controls = {};

    spec.rows.forEach((row, index) => {
        view.addSubview(widgets.makeLabel(
            bridge.ns,
            row.label,
            labelRect(index, rowCount)
        ));

        const control = ADD_ROW[row.kind](
            context,
            row,
            controlRect(index, rowCount)
        );

        control.setAccessibilityLabel(row.label);
        control.setAccessibilityHelp([
            row.invalid ? "Invalid value. Correct this setting." : "",
            row.hint ?? row.options.map((option) => option.label).join("; ")
        ].filter(Boolean).join(" "));
        controls[row.key] = control;
    });

    const built = { view, controls, details };
    built.controller = modeController(bridge, built, spec);
    return built;
}

const { MODAL_UNAVAILABLE } = require("./objc-bridge.js");
const { makeDetails } = require("./details-dialog.js");

// Gathered into one object so a test can substitute the whole widget layer.
const WIDGETS = {
    makeDetails,
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

const FIRST_BUTTON = 1000;

function readControls(bridge, spec, controls) {
    const answers = {};

    for (const row of spec.rows) {
        const control = controls[row.key];

        if (row.kind !== "choice") {

            // eslint-disable-next-line no-unused-expressions
            control.validateEditing;
        }

        answers[row.key] = row.kind === "choice" ? row.options[Number(control.indexOfSelectedItem)].value : String(bridge.objc.unwrap(control.stringValue));
        if (row.kind === "colour") {
            const option = row.options[Number(control.indexOfSelectedItem)];
            if (option && answers[row.key] === option.label) { answers[row.key] = option.value; }
        }
    }

    return answers;
}

function presentForm(bridge, spec, widgets = WIDGETS) {
    const built = buildForm(bridge, spec, widgets);
    const { view, controls } = built;
    const alert = widgets.makeAlert(bridge.ns, spec);

    alert.accessoryView = view;
    const focus = spec.rows.find((row) => row.invalid) ?? spec.rows.find((row) => row.kind === "number");
    alert.window.initialFirstResponder = controls[focus.key];

    const response = Number(alert.runModal);

    if (response === MODAL_UNAVAILABLE) {
        return null;
    }

    return response === FIRST_BUTTON
        ? { answers: readControls(bridge, spec, controls) }
        : { cancelled: true };
}

module.exports = { ROW_HEIGHT, PADDING, COLOUR_WIDTH, NUMBER_WIDTH, FORM_WIDTH, formSize, labelRect, controlRect, hintRect, makeView, makeLabel, makeHint, makePopup, addPopupItem, markInvalid, markHintInvalid, makeAlert, makeField, makeColourCombo, buildForm, presentForm, WIDGETS };
