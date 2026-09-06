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

function makeField(rect) {
    return { kind: "field", rect, stringValue: "" };
}

function makePopup(rect, pullsDown) {
    const items = [];
    const popup = { kind: "popup", rect, items, pullsDown, selected: null };

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

function makeImage(size) {
    const image = { kind: "image", size, focused: 0, fills: [] };

    Object.defineProperty(image, "lockFocus", {
        get: () => {
            image.focused += 1;

            return true;
        }
    });
    Object.defineProperty(image, "unlockFocus", {
        get: () => {
            image.focused -= 1;

            return true;
        }
    });

    return image;
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

            return state.responses.length > 0 ? state.responses.shift() : 1000;
        }
    });

    return alert;
}

module.exports = { makeView, makeField, makePopup, makeImage, makeAlert };
