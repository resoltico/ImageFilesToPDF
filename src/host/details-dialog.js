"use strict";
const { appkitBridge, MODAL_UNAVAILABLE } = require("./objc-bridge.js");

const DETAIL_HEIGHT = 140;
const DETAIL_WIDTH = 470;
const FIRST_BUTTON = 1000;
const TEXT_HEIGHT = 1000000;
const WIDTH_SIZABLE = 2;

/** Full, selectable content in a fixed region; no arbitrary path goes in fixed alert text. */
function makeDetails(ns, text, rect) {
    const scroll = ns.NSScrollView.alloc.initWithFrame(ns.NSMakeRect(rect.left, rect.bottom, rect.width, rect.height));
    scroll.hasVerticalScroller = true;
    scroll.autohidesScrollers = false;
    const size = scroll.contentSize;
    const content = ns.NSTextView.alloc.initWithFrame(ns.NSMakeRect(0, 0, size.width, size.height));
    Object.assign(content, { editable: false, selectable: true, richText: false, drawsBackground: false,
        font: ns.NSFont.systemFontOfSize(ns.NSFont.systemFontSize), textColor: ns.NSColor.labelColor,
        verticallyResizable: true, horizontallyResizable: false, autoresizingMask: WIDTH_SIZABLE, maxSize: ns.NSMakeSize(size.width, TEXT_HEIGHT) });
    Object.assign(content.textContainer, { containerSize: ns.NSMakeSize(size.width, TEXT_HEIGHT), widthTracksTextView: true });
    content.string = text;
    content.setAccessibilityLabel("Full details (selectable and scrollable)");
    scroll.documentView = content;
    return scroll;
}

const DETAIL_COLUMNS = 78;
const DETAIL_LINES = 14;

function detailPages(text) {
    const lines = String(text).split("\n").flatMap((line) => {
        const chars = Array.from(line);
        const wrapped = [];
        for (let offset = 0; offset < chars.length; offset += DETAIL_COLUMNS) {
            wrapped.push(chars.slice(offset, offset + DETAIL_COLUMNS).join(""));
        }
        return wrapped.length > 0 ? wrapped : [""];
    });
    const pages = [];
    for (let offset = 0; offset < lines.length; offset += DETAIL_LINES) {
        pages.push(lines.slice(offset, offset + DETAIL_LINES).join("\n"));
    }
    return pages;
}

function showDetailPages(app, spec) {
    const pages = detailPages(spec.fallbackDetail ?? spec.detail);
    for (const [index, page] of pages.entries()) {
        const action = index === pages.length - 1 ? spec.buttons[0] : "Next";
        const optional = index === pages.length - 1 ? spec.buttons.slice(1) : spec.buttons.slice(-1).filter((button) => button !== spec.buttons[0]);
        const buttons = [...optional, action];
        const response = app.displayDialog(page, { withTitle: spec.title, buttons,
            defaultButton: action, ...(buttons.includes("Cancel") ? { cancelButton: "Cancel" } : {}) });
        if (response.buttonReturned !== action) { return spec.buttons.indexOf(response.buttonReturned); }
    }
    return 0;
}

function detailsAlert(ns, spec) {
    const alert = ns.NSAlert.alloc.init;
    alert.messageText = spec.title;
    alert.informativeText = spec.summary;
    alert.accessoryView = makeDetails(ns, spec.detail, { left: 0, bottom: 0, width: DETAIL_WIDTH, height: DETAIL_HEIGHT });
    for (const button of spec.buttons) { alert.addButtonWithTitle(button); }
    return alert;
}

function showDetails(app, spec, bridge = appkitBridge(globalThis.ObjC, globalThis.$)) {
    if (!bridge) { return showDetailPages(app, spec); }
    const response = Number(detailsAlert(bridge.ns, spec).runModal);
    return response === MODAL_UNAVAILABLE ? showDetailPages(app, spec) : response - FIRST_BUTTON;
}
module.exports = { makeDetails, detailsAlert, showDetails, detailPages, DETAIL_HEIGHT, DETAIL_WIDTH };
