"use strict";

const { perform, rectOf } = require("./panel-widgets.js");

/*
 * What is done to the progress panel once it exists, and what has to be true
 * of the process before it can exist at all.
 *
 * The one decision here is the activation policy, which is about the process
 * rather than about the window. Everything else is a single call: whether the
 * panel has been on screen yet, and what it should say, are panel.js's.
 */

/*
 * How long the run loop is given to get what was drawn onto the screen.
 *
 * NSModalPanelRunLoopMode rather than the default: this code is executing
 * inside an Apple Event, and the default mode is where another one would be
 * delivered. The modal panel mode is what AppKit itself runs while a panel is
 * up, which is the situation exactly.
 *
 * This constant and that mode are the two knobs. If the panel appears inside a
 * Shortcut and never repaints, they are the pair to turn.
 */
const PAINT_SECONDS = 0.01;

/*
 * NSApplicationActivationPolicy. Prohibited cannot put a window on screen at
 * all; accessory can, and shows neither a Dock icon nor a menu bar. Regular is
 * the one that would interrupt somebody mid-action with an icon appearing in
 * their Dock, and nothing here ever sets it.
 */
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

/*
 * Whether this process may put a window on screen, and putting the answer back
 * the way it was found.
 *
 * A prohibited application cannot order a window front at all -- it can still
 * run a modal session, which is why the settings form displays and why that
 * form is no evidence for this panel. Accessory is the smallest policy that
 * can show a window: no Dock icon, no menu bar, nothing that appears while
 * somebody is working.
 */
function allowWindows(ns) {
    const policy = policyOf(ns);

    if (policy === POLICY_PROHIBITED) {
        setPolicy(ns, POLICY_ACCESSORY);
    }

    return () => setPolicy(ns, policy);
}

/*
 * Drawn now rather than marked dirty and left for a run loop pass that may
 * never come: -[NSWindow display] is recursive and synchronous. The bounded
 * pump afterwards is what gets the result composited onto the screen.
 */
function paint(ns, panel) {
    perform(panel, "display");
    ns.NSRunLoop.currentRunLoop.runModeBeforeDate(
        ns.NSModalPanelRunLoopMode,
        ns.NSDate.dateWithTimeIntervalSinceNow(PAINT_SECONDS)
    );
}

/*
 * Ordered front without being activated, which is the difference between
 * saying what this run is doing and taking over the machine while it does it.
 */
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

module.exports = {
    PAINT_SECONDS,
    POLICY_ACCESSORY,
    POLICY_PROHIBITED,
    policyOf,
    setPolicy,
    allowWindows,
    paint,
    show,
    hide,
    closeWindow,
    setFrame,
    setHidden
};
