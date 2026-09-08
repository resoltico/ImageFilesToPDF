"use strict";

/*
 * The structure a form is built from: the view, the labels, the menus and
 * the alert around them. Controls a person types into are appkit-fields.js,
 * and between them they are the only code that touches AppKit directly.
 *
 * Every function takes the ObjC namespace as its first parameter rather than
 * reaching for the `$` global, which is what lets the composition above be
 * driven by a fake in tests. What a fake cannot prove is that AppKit renders
 * any of it; that was established by running a probe inside the Shortcuts
 * helper, and is why appkit.js keeps the stepwise dialogs as a fallback.
 *
 * Deliberately branchless: anything with a decision in it belongs in
 * src/core/form.js, where it can be tested properly.
 */

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

/*
 * The bounds a field accepts, shown beside it rather than folded into its
 * name: smaller, secondary, and free to be as long as it needs.
 */
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

    return popup.lastItem;
}

/*
 * Shows which control the message above the form is talking about. Applied by
 * the layout, which knows whether a row is in the problem list; this only
 * draws it.
 */
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

module.exports = {
    makeView,
    makeLabel,
    makeHint,
    makePopup,
    addPopupItem,
    markInvalid,
    markHintInvalid,
    makeAlert
};
