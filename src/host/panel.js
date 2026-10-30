"use strict";

const PANEL_WIDTH = 420;
const PADDING_X = 18;
const PADDING_Y = 16;
const HEADLINE_HEIGHT = 18;
const DETAIL_HEIGHT = 16;
const BAR_HEIGHT = 6;

// Tight under the headline, because they are one statement in two voices; the
// bar is a separate thing and is spaced like one.
const HEADLINE_GAP = 4;
const BAR_GAP = 12;

// Padding sits at both edges, and the bar is as round as it is tall.
const EDGES = 2;
const BAR_RADIUS = BAR_HEIGHT / EDGES;

const CONTENT_WIDTH = PANEL_WIDTH - PADDING_X * EDGES;
const STOP_WIDTH = 72;
const FOOTER_HEIGHT = 24;
const BAR_WIDTH = CONTENT_WIDTH - STOP_WIDTH - BAR_GAP;

const PANEL_HEIGHT = PADDING_Y * EDGES +
    HEADLINE_HEIGHT + HEADLINE_GAP + DETAIL_HEIGHT + BAR_GAP + FOOTER_HEIGHT;

const HEADLINE_BOTTOM = PANEL_HEIGHT - PADDING_Y - HEADLINE_HEIGHT;
const DETAIL_BOTTOM = HEADLINE_BOTTOM - HEADLINE_GAP - DETAIL_HEIGHT;
const BAR_BOTTOM = PADDING_Y + (FOOTER_HEIGHT - BAR_HEIGHT) / EDGES;

function row(bottom, height, width = CONTENT_WIDTH) {
    return { left: PADDING_X, bottom, width, height };
}

const PANEL_RECT = Object.freeze({
    left: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT
});

const HEADLINE_RECT = Object.freeze(row(HEADLINE_BOTTOM, HEADLINE_HEIGHT));
const DETAIL_RECT = Object.freeze(row(DETAIL_BOTTOM, DETAIL_HEIGHT));
const TRACK_RECT = Object.freeze(row(BAR_BOTTOM, BAR_HEIGHT, BAR_WIDTH));

function fillRect(done, total) {
    const fraction = total > 0 ? Math.min(done / total, 1) : 0;

    return row(BAR_BOTTOM, BAR_HEIGHT, BAR_WIDTH * fraction);
}

// NSBackingStoreBuffered.
const BACKING_BUFFERED = 2;

const STYLE_TITLED = 1;
const STYLE_UTILITY = 16;
const STYLE_NONACTIVATING = 128;
const PANEL_STYLE = STYLE_TITLED + STYLE_UTILITY + STYLE_NONACTIVATING;

// NSFloatingWindowLevel. Above the Finder window the selection was made in,
// below anything the system puts up.
const FLOATING_LEVEL = 3;

const BOX_CUSTOM = 4;
const NO_BORDER = 0;
const NO_TITLE = 0;

const HEADLINE_FONT_SIZE = 13;
const DETAIL_FONT_SIZE = 11;

// NSLineBreakByTruncatingTail: a filename too long for the panel ends in an
// ellipsis rather than being cut mid-word.
const TRUNCATES_TAIL = 4;

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
    panel.ignoresMouseEvents = false;
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

const PAINT_SECONDS = 0.01;

const POLICY_ACCESSORY = 1;
const POLICY_PROHIBITED = 2;

function sharedApplication(ns) {
    return ns.NSApplication.sharedApplication;
}

function policyOf(ns) {
    return Number(perform(sharedApplication(ns), "activationPolicy"));
}

function setPolicy(ns, policy) {
    sharedApplication(ns).setActivationPolicy(policy);
}

function allowWindows(ns) {
    const policy = policyOf(ns);

    if (policy === POLICY_PROHIBITED) {
        setPolicy(ns, POLICY_ACCESSORY);
    }

    return () => setPolicy(ns, policy);
}

function paint(ns, panel) {
    const app = sharedApplication(ns);
    const event = app.nextEventMatchingMaskUntilDateInModeDequeue(ns.NSEventMaskAny, ns.NSDate.distantPast, ns.NSDefaultRunLoopMode, true);
    if (event && !event.isNil()) { app.sendEvent(event); }
    perform(panel, "display");
    ns.NSRunLoop.currentRunLoop.runModeBeforeDate(
        ns.NSModalPanelRunLoopMode,
        ns.NSDate.dateWithTimeIntervalSinceNow(PAINT_SECONDS)
    );
}

function show(panel) {
    perform(panel, "orderFrontRegardless");
}

function hide(panel) {
    panel.orderOut(null);
}

function closeWindow(panel) {
    perform(panel, "close");
}

function setFrame(ns, view, rect) {
    view.frame = rectOf(ns, rect);
}

function setHidden(view, hidden) {
    view.hidden = hidden;
}

const { UserCancelled } = require("../core/errors.js");
const { APP_NAME } = require("../core/version.js");
const { appkitBridge } = require("./objc-bridge.js");

const APPEARANCE_DELAY = 500;

function makeStop(ns) {
    const button = ns.NSButton.alloc.initWithFrame(rectOf(ns, { left: PANEL_WIDTH - PADDING_X - STOP_WIDTH, bottom: PADDING_Y, width: STOP_WIDTH, height: FOOTER_HEIGHT }));
    button.title = "Stop";
    button.bezelStyle = 1;
    // Push-on/push-off retains a request until the next safe checkpoint.
    button.setButtonType(1);
    return button;
}

function build(ns) {
    const content = makeContent(ns, PANEL_RECT);
    const view = {
        panel: makePanel(ns, PANEL_RECT, APP_NAME),
        stop: makeStop(ns),
        headline: makeHeadline(ns, HEADLINE_RECT),
        detail: makeDetail(ns, DETAIL_RECT),
        track: makeBar(ns, TRACK_RECT, ns.NSColor.separatorColor),
        // Added after the track so it draws over it.
        fill: makeBar(ns, fillRect(0, 0), ns.NSColor.controlAccentColor)
    };

    for (const part of [view.headline, view.detail, view.track, view.fill, view.stop]) {
        content.addSubview(part);
    }

    // A bar drawn empty before the images have been counted says none of a
    // known quantity is done. What is true is that the quantity is not known.
    setHidden(view.track, true);
    setHidden(view.fill, true);
    view.panel.contentView = content;

    return view;
}

function panelSink(view, ns, now, restore) {
    let total = 0;
    let armedAt = now();

    return {
        start(units) {
            total = units;
            setHidden(view.track, false);
            setHidden(view.fill, false);
        },

        report(done, description, detail) {
            view.headline.stringValue = description;
            view.detail.stringValue = detail;
            setFrame(ns, view.fill, fillRect(done, total));

            if (now() - armedAt < APPEARANCE_DELAY) {
                return;
            }

            show(view.panel);
            paint(ns, view.panel);
            if (Number(view.stop.state) !== 0) { throw new UserCancelled(); }
        },

        // Out of the way of a question, and armed again: whatever happens
        // after the answer has its own reason to be worth a window.
        pause() {
            hide(view.panel);
            armedAt = now();
        },

        close() {
            hide(view.panel);
            closeWindow(view.panel);
            restore();
        }
    };
}

function openPanel(bridge = appkitBridge(globalThis.ObjC, globalThis.$), now = Date.now) {
    if (!bridge) {
        return null;
    }

    const view = build(bridge.ns);
    return panelSink(view, bridge.ns, now, allowWindows(bridge.ns));
}

module.exports = { BAR_RADIUS, PANEL_RECT, HEADLINE_RECT, DETAIL_RECT, TRACK_RECT, fillRect, PANEL_STYLE, perform, rectOf, makePanel, makeContent, makeHeadline, makeDetail, makeBar, PAINT_SECONDS, POLICY_ACCESSORY, POLICY_PROHIBITED, policyOf, setPolicy, allowWindows, paint, show, hide, closeWindow, setFrame, setHidden, APPEARANCE_DELAY, build, panelSink, openPanel };
