"use strict";

const { DOMAIN, KEY } = require("../core/preferences.js");

/*
 * Where the record is kept: a defaults domain of this action's own.
 *
 * Not the standard defaults. "Standard" means the defaults of the application
 * that is running, and the application running a pasted script is Apple's
 * Shortcuts helper -- so writing there would put this action's settings in
 * somebody else's domain, alongside whatever every other script in that
 * helper had left behind. A named suite is addressed by name and belongs to
 * nothing else.
 *
 * Which is also why there is no fallback to the standard defaults when the
 * suite cannot be made. There is no second-best place to put this: a run that
 * cannot remember opens on the compiled defaults, converts the images, and
 * says nothing about it. Nobody's PDF depends on it.
 *
 * Whether a named suite is writable inside the Shortcuts helper is not
 * something anything headless can establish -- QA.md says how it is checked
 * and what the check has to cover.
 */

function createMemory(objc, ns) {
    if (!objc || !ns) {
        return null;
    }

    try {
        objc.import("Foundation");
    } catch {
        return null;
    }

    const suite = ns.NSUserDefaults.alloc.initWithSuiteName(ns(DOMAIN));

    if (!suite) {
        return null;
    }

    return {
        // Nothing there and nothing readable are the same answer.
        recall() {
            try {
                return String(objc.unwrap(suite.stringForKey(ns(KEY))) ?? "");
            } catch {
                return "";
            }
        },

        // Best effort, and deliberately silent: a preference that would not
        // stick is not a failure of the conversion, and the completion
        // dialog is about the documents.
        remember(text) {
            try {
                suite.setObjectForKey(ns(text), ns(KEY));
            } catch {
                // The next run opens on the defaults, which is what it did
                // before there was anything to remember.
            }
        }
    };
}

module.exports = { createMemory };
