"use strict";

const { formSpec } = require("../core/form.js");
const { readAnswers } = require("../core/answers.js");
const { isUserCancelled, UserCancelled } = require("../core/errors.js");
const { presentForm } = require("./appkit.js");
const { collectDialogSettings } = require("./dialogs.js");

/*
 * Which front end asks for the settings.
 *
 * The AppKit form is preferred and the stepwise dialogs are the fallback,
 * rather than the form replacing them. A probe run inside ShortcutsMacHelper
 * showed the form displays there without touching the activation policy, but
 * that is a fact about this macOS, not a guarantee about the next one, and a
 * tool whose interface disappears is worse than one that asks six questions.
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

/*
 * One pass: present, and report what came back as either unusable, the
 * settings, or the answers to try again with.
 */
function formRound(bridge, present, state) {
    const outcome = present(
        bridge,
        formSpec(state.answers, state.problems, state.count)
    );

    if (!outcome) {
        return { unavailable: true };
    }

    if (outcome.cancelled) {
        throw new UserCancelled();
    }

    const read = readAnswers(outcome.answers);

    return read.settings
        ? { settings: read.settings }
        : { answers: outcome.answers, problems: read.problems };
}

/*
 * Redisplayed with the previous answers and every problem at once, so
 * correcting a mistyped DPI does not mean answering the other five again.
 */
function collectViaForm(bridge, present, count = 0) {
    // Nothing answered and nothing wrong yet. What that shows is formSpec's
    // to say: stating the defaults again here would be a second copy of them,
    // free to drift from the first.
    let state = { count };

    for (;;) {
        const round = formRound(bridge, present, state);

        if (round.unavailable) {
            return null;
        }

        if (round.settings) {
            return round.settings;
        }

        state = { ...round, count };
    }
}

/*
 * A cancellation is an answer and must be honoured. Anything else the form
 * throws is treated as the form being unusable, because falling back to
 * dialogs that work is better than failing the run over a widget.
 */
function attemptForm(bridge, present, count) {
    try {
        return collectViaForm(bridge, present, count);
    } catch (error) {
        if (isUserCancelled(error)) {
            throw error;
        }

        return null;
    }
}

function collectSettings(
    app,
    count = 0,
    bridge = appkitBridge(globalThis.ObjC, globalThis.$),
    present = presentForm
) {
    if (bridge) {
        const settings = attemptForm(bridge, present, count);

        if (settings) {
            return settings;
        }
    }

    return collectDialogSettings(app);
}

module.exports = { appkitBridge, collectViaForm, collectSettings };
