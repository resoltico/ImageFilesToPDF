"use strict";

const { APP_NAME } = require("../core/version.js");
const { appkitBridge } = require("./objc-bridge.js");
const {
    PANEL_RECT,
    HEADLINE_RECT,
    DETAIL_RECT,
    TRACK_RECT,
    fillRect
} = require("./panel-geometry.js");
const {
    makePanel,
    makeContent,
    makeHeadline,
    makeDetail,
    makeBar
} = require("./panel-widgets.js");
const {
    allowWindows,
    paint,
    show,
    hide,
    closeWindow,
    setFrame,
    setHidden
} = require("./panel-window.js");

/*
 * A window that says what the run is doing, for the hosts that present nothing
 * of their own.
 *
 * The host's Progress object is displayed by Script Editor, by an applet and
 * by the system script menu. A Shortcut is none of those, and this action is
 * shipped as a Shortcut -- so the report that mattered most was the one going
 * to the surface nobody could see. This is the other surface, and the two are
 * written to together rather than one falling back to the other: they are
 * presented by different hosts, not by the same host twice.
 *
 * Nothing here asks for input and nothing here waits. What it costs is one
 * bounded run loop pump per report, and what it buys is the difference between
 * a tool that looks hung and a tool that says "3 of 20".
 */

/*
 * How long a run has to have been going before a window is worth putting up.
 *
 * A conversion of two small images is over in less time than it takes to read
 * the panel, and flashing one up on the way past is worse than saying nothing.
 * There is no timer: the clock is read when a report arrives, which is the
 * only moment the answer is needed.
 */
const APPEARANCE_DELAY = 500;

function build(ns) {
    const content = makeContent(ns, PANEL_RECT);
    const view = {
        panel: makePanel(ns, PANEL_RECT, APP_NAME),
        headline: makeHeadline(ns, HEADLINE_RECT),
        detail: makeDetail(ns, DETAIL_RECT),
        track: makeBar(ns, TRACK_RECT, ns.NSColor.separatorColor),
        // Added after the track so it draws over it.
        fill: makeBar(ns, fillRect(0, 0), ns.NSColor.controlAccentColor)
    };

    for (const part of [view.headline, view.detail, view.track, view.fill]) {
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

/*
 * Built before the policy is touched, so a host that cannot make a window
 * leaves this process exactly as it found it.
 */
function openPanel(bridge = appkitBridge(globalThis.ObjC, globalThis.$), now = Date.now) {
    if (!bridge) {
        return null;
    }

    try {
        const view = build(bridge.ns);

        return panelSink(view, bridge.ns, now, allowWindows(bridge.ns));
    } catch {
        // No window server, no AppKit, a host that refuses one of these
        // objects: the run says what it can elsewhere and converts the same.
        return null;
    }
}

module.exports = { APPEARANCE_DELAY, build, panelSink, openPanel };
