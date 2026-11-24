"use strict";
const FILL_CLASS = "ImageFilesToPDFInvalidSettingFill";
const FILL_IDENTIFIER = "InvalidSettingFill";
// A tint rather than a solid fill, and drawn from the system red so it
// follows the appearance the alert is rendered in. A fixed pink would be
// wrong the moment the form appears in dark mode.
const TINT_ALPHA = 0.18;
const CORNER_RADIUS = 4;

function fillType(ns, objc) {
    let type = ns.NSClassFromString(FILL_CLASS);
    if (!type || type.isNil()) {
        // Capture Objective-C nil before callbacks; inherit AppKit method signatures.
        const nil = ns();
        objc.registerSubclass({ name: FILL_CLASS, superclass: "NSBox", methods: {
            "hitTest:": () => nil,
            isOpaque: () => false,
            acceptsFirstResponder: () => false
        } });
        type = ns.NSClassFromString(FILL_CLASS);
    }
    return type;
}

// AppKit owns control backing layers. A separate native view paints above the
// whole control while leaving its mouse, keyboard and accessibility target intact.
function markInvalid(ns, control, objc) {
    const fill = fillType(ns, objc).alloc.initWithFrame(control.frame);
    fill.identifier = FILL_IDENTIFIER;
    fill.boxType = ns.NSBoxCustom;
    fill.borderType = ns.NSNoBorder;
    fill.borderWidth = 0;
    fill.titlePosition = ns.NSNoTitle;
    fill.contentViewMargins = ns.NSMakeSize(0, 0);
    fill.transparent = false;
    fill.fillColor = ns.NSColor.systemRedColor.colorWithAlphaComponent(TINT_ALPHA);
    fill.cornerRadius = CORNER_RADIUS;
    fill.wantsLayer = true;
    fill.autoresizingMask = control.autoresizingMask;
    fill.setAccessibilityElement(false);
    fill.frame = control.frame;
    control.superview.addSubviewPositionedRelativeTo(fill, ns.NSWindowAbove, control);
}
module.exports = { markInvalid };
