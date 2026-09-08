"use strict";

/*
 * The AppKit objects the widget layer builds, as plain recorders.
 *
 * Zero-argument ObjC methods are getters here, because that is how JXA
 * invokes them: `alert.runModal` runs the modal, it does not describe it.
 */

function makeView(rect) {
    const view = { kind: "view", rect, subviews: [] };

    view.addSubview = (child) => view.subviews.push(child);

    return view;
}

/*
 * committed counts validateEditing, which is how the form takes what is being
 * typed out of the field editor before reading it.
 */
function commitCounter(control) {
    Object.defineProperty(control, "validateEditing", {
        get: () => {
            control.committed += 1;

            return true;
        }
    });

    return control;
}

function makeField(rect) {
    return commitCounter({
        kind: "field",
        rect,
        stringValue: "",
        committed: 0
    });
}

function makeCombo(rect) {
    const combo = commitCounter({
        kind: "combo",
        rect,
        items: [],
        stringValue: "",
        committed: 0
    });

    combo.addItemsWithObjectValues = (values) => {
        combo.items.push(...values.boxed);
    };
    combo.setAccessibilityLabel = (label) => {
        combo.accessibilityLabel = label;
    };

    return combo;
}

function makePopup(rect, pullsDown) {
    const items = [];
    const popup = commitCounter({
        kind: "popup",
        rect,
        items,
        pullsDown,
        selected: null,
        committed: 0
    });

    popup.addItemWithTitle = (title) => items.push({ title, image: null });
    popup.selectItemWithTitle = (title) => {
        popup.selected = title;
    };

    Object.defineProperty(popup, "lastItem", { get: () => items.at(-1) });
    Object.defineProperty(popup, "titleOfSelectedItem", {
        get: () => popup.selected
    });

    return popup;
}

function makeAlert(state) {
    const alert = {
        kind: "alert",
        buttons: [],
        accessoryView: null,
        messageText: "",
        informativeText: ""
    };

    alert.addButtonWithTitle = (title) => alert.buttons.push(title);
    Object.defineProperty(alert, "runModal", {
        get: () => {
            state.alerts.push(alert);
            // Where a person would be typing: the controls exist and nothing
            // has been read back yet.
            state.duringModal(alert);

            return state.responses.length > 0 ? state.responses.shift() : 1000;
        }
    });

    return alert;
}

module.exports = { makeView, makeField, makeCombo, makePopup, makeAlert };
