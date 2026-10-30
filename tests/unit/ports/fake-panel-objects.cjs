"use strict";

/*
 * The progress panel's objects. A window records what was done to it rather
 * than doing any of it: ordering front, drawing and closing are the three
 * things no headless test can prove happened, so what is checked is that they
 * were asked for, in that order, and with nothing else alongside them.
 */
function makeWindow(rect, styleMask, backing, defer) {
    const window = {
        kind: "window",
        rect,
        styleMask,
        backing,
        defer,
        contentView: null,
        done: []
    };

    for (const method of [
        "center",
        "orderFrontRegardless",
        "display",
        "close"
    ]) {
        Object.defineProperty(window, method, {
            get: () => window.done.push(method)
        });
    }

    window.orderOut = (sender) => window.done.push(`orderOut:${sender}`);

    return window;
}

function makeBox(rect) {
    return { kind: "box", rect, hidden: false, frame: rect };
}

module.exports = { makeWindow, makeBox };
