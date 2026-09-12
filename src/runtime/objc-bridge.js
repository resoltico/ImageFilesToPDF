"use strict";

/*
 * Whether AppKit can be reached at all.
 *
 * A bridge that will not take the framework is one that cannot draw anything,
 * and every caller has somewhere else to go: the settings form falls back to
 * the stepwise dialogs, and the progress panel falls back to reporting through
 * the host's own Progress object. Neither fails a run over a widget.
 *
 * It lives here rather than beside either of them because both need it, and a
 * progress panel that had to import the settings form to ask whether AppKit
 * exists would be pointing its dependency at the wrong thing.
 */

function appkitBridge(objc, ns) {
    if (!objc || !ns) {
        return null;
    }

    try {
        objc.import("AppKit");

        return { objc, ns };
    } catch {
        return null;
    }
}

module.exports = { appkitBridge };
