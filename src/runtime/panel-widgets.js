"use strict";

const { BAR_RADIUS } = require("./panel-geometry.js");

/*
 * The AppKit objects the progress panel is made of, and nothing that decides
 * anything. The namespace arrives as a parameter, which is what lets the
 * composition above be driven by a fake.
 *
 * Everything here is display. There is no target, no action, no delegate, no
 * timer and no text a person can type into, because nothing pumps a run loop
 * for any of it to respond with. A panel that looks interactive and is not is
 * worse than one that plainly is not.
 */

// NSBackingStoreBuffered.
const BACKING_BUFFERED = 2;

/*
 * Titled, because a strip of text floating with no frame reads as a glitch;
 * utility, because that is the small panel a progress report belongs in; and
 * non-activating, which is the whole point -- this process is not frontmost
 * and must not become frontmost to say what it is doing. No close button:
 * the run owns the window, and dismissing it would not stop the work.
 * Summed rather than or-ed: the bits are disjoint, so the sum is the union.
 */
const STYLE_TITLED = 1;
const STYLE_UTILITY = 16;
const STYLE_NONACTIVATING = 128;
const PANEL_STYLE = STYLE_TITLED + STYLE_UTILITY + STYLE_NONACTIVATING;

// NSFloatingWindowLevel. Above the Finder window the selection was made in,
// below anything the system puts up.
const FLOATING_LEVEL = 3;

/*
 * NSBoxCustom with NSNoBorder and NSNoTitle: a solid rounded rectangle and
 * nothing else. Chosen over NSProgressIndicator, whose animation machinery
 * would need a run loop to tick and could not be stopped from here.
 */
const BOX_CUSTOM = 4;
const NO_BORDER = 0;
const NO_TITLE = 0;

const HEADLINE_FONT_SIZE = 13;
const DETAIL_FONT_SIZE = 11;

// NSLineBreakByTruncatingTail: a filename too long for the panel ends in an
// ellipsis rather than being cut mid-word.
const TRUNCATES_TAIL = 4;

/*
 * A zero-argument ObjC method, which JXA performs on property access. Named
 * once rather than written as a bare expression statement at each call, where
 * it reads as a mistake and has to be excused to the linter.
 */
function perform(target, method) {
    return target[method];
}

function rectOf(ns, rect) {
    return ns.NSMakeRect(rect.left, rect.bottom, rect.width, rect.height);
}

function makePanel(ns, rect, title) {
    const panel = ns.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer(
        rectOf(ns, rect),
        PANEL_STYLE,
        BACKING_BUFFERED,
        false
    );

    panel.title = title;
    panel.level = FLOATING_LEVEL;
    // A utility panel hides itself when its application is not active, and
    // this one's never is. Without this it is built, ordered front, and gone,
    // with every call reporting success.
    panel.hidesOnDeactivate = false;
    panel.becomesKeyOnlyIfNeeded = true;
    panel.ignoresMouseEvents = true;
    // JXA holds the reference. An over-release is a crash with no dialog.
    panel.releasedWhenClosed = false;
    perform(panel, "center");

    return panel;
}

function makeContent(ns, rect) {
    return ns.NSView.alloc.initWithFrame(rectOf(ns, rect));
}

function makeText(ns, rect, font, colour) {
    const text = ns.NSTextField.alloc.initWithFrame(rectOf(ns, rect));

    text.stringValue = "";
    text.editable = false;
    text.bezeled = false;
    text.drawsBackground = false;
    text.selectable = false;
    text.font = font;
    text.textColor = colour;
    text.lineBreakMode = TRUNCATES_TAIL;

    return text;
}

function makeHeadline(ns, rect) {
    return makeText(
        ns,
        rect,
        ns.NSFont.boldSystemFontOfSize(HEADLINE_FONT_SIZE),
        ns.NSColor.labelColor
    );
}

function makeDetail(ns, rect) {
    return makeText(
        ns,
        rect,
        ns.NSFont.systemFontOfSize(DETAIL_FONT_SIZE),
        ns.NSColor.secondaryLabelColor
    );
}

function makeBar(ns, rect, colour) {
    const box = ns.NSBox.alloc.initWithFrame(rectOf(ns, rect));

    box.boxType = BOX_CUSTOM;
    box.borderType = NO_BORDER;
    box.borderWidth = 0;
    box.titlePosition = NO_TITLE;
    box.fillColor = colour;
    box.cornerRadius = BAR_RADIUS;

    return box;
}

module.exports = {
    PANEL_STYLE,
    perform,
    rectOf,
    makePanel,
    makeContent,
    makeHeadline,
    makeDetail,
    makeBar
};
