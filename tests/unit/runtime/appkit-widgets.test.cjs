"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    makeView,
    makeLabel,
    makeHint,
    makePopup,
    addPopupItem,
    makeField,
    makeAlert
} = require("../../../src/runtime/appkit-widgets.js");
const { createFakeObjC } = require("./fake-objc.cjs");

const RECT = { left: 10, bottom: 20, width: 100, height: 24 };

function bridge() {
    return createFakeObjC();
}

test("a label is inert: not editable, not selectable, no chrome", () => {
    // Built from the same NSTextField as an input, so without these it is an
    // empty box a person can type into.
    const label = makeLabel(bridge().ns, "Paper size:", RECT);

    assert.equal(label.stringValue, "Paper size:");
    assert.equal(label.editable, false);
    assert.equal(label.bezeled, false);
    assert.equal(label.drawsBackground, false);
    assert.equal(label.selectable, false);
});

test("a hint is secondary: smaller, dimmer, and not editable", () => {
    // It sits beside a field and must not compete with it for attention, nor
    // look like somewhere to type.
    const { ns } = bridge();
    const hint = makeHint(ns, "72–1200 DPI", RECT);

    assert.equal(hint.stringValue, "72–1200 DPI");
    assert.equal(hint.editable, false);
    assert.equal(hint.drawsBackground, false);
    assert.ok(hint.font.size < 13, "smaller than the labels beside it");
    assert.equal(hint.textColor.name, "secondaryLabel");
});

test("a field keeps its value and its place", () => {
    const field = makeField(bridge().ns, "300", RECT);

    assert.equal(field.stringValue, "300");
    assert.deepEqual(field.rect, RECT);
    assert.notEqual(field.editable, false, "a field must stay editable");
});

test("a choice control is a pop-up, not a pull-down", () => {
    // A pull-down keeps showing its first item as the title whatever is
    // chosen, so the form would never show the current answer.
    const popup = makePopup(bridge().ns, RECT);

    assert.equal(popup.pullsDown, false);
});

test("a view is sized as asked", () => {
    const view = makeView(bridge().ns, 400, 192);

    assert.equal(view.rect.width, 400);
    assert.equal(view.rect.height, 192);
});

test("an alert is titled and carries its buttons in order", () => {
    const { ns } = bridge();
    const alert = makeAlert(ns, {
        title: "Image Files to PDF",
        detail: "Choose how the pages are built.",
        buttons: ["Create PDF", "Cancel"]
    });

    assert.equal(alert.messageText, "Image Files to PDF");
    assert.equal(alert.informativeText, "Choose how the pages are built.");
    // Order is meaning here: AppKit makes the first button the default.
    assert.deepEqual(alert.buttons, ["Create PDF", "Cancel"]);
});

test("an option gets an image only when it has a colour", () => {
    const { ns } = bridge();
    const popup = makePopup(ns, RECT);

    addPopupItem(ns, popup, { label: "A4", swatch: null });
    addPopupItem(ns, popup, {
        label: "Dark blue (#204486)",
        swatch: { red: 32, green: 68, blue: 134 }
    });

    assert.deepEqual(popup.items.map((item) => item.title), [
        "A4",
        "Dark blue (#204486)"
    ]);
    assert.equal(popup.items[0].image, null);
    assert.ok(popup.items[1].image, "a colour option must show its colour");
});

test("a hint has no chrome of any kind", () => {
    // Built from the same NSTextField as an input. A bezel or a background
    // would make a read-only note look like somewhere to type.
    const hint = makeHint(bridge().ns, "72–1041 DPI", RECT);

    assert.equal(hint.bezeled, false);
    assert.equal(hint.selectable, false);
    assert.equal(hint.editable, false);
    assert.equal(hint.drawsBackground, false);
});
