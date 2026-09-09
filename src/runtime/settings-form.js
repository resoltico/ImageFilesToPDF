"use strict";

const { formSpec } = require("../core/form.js");
const { readAnswers } = require("../core/answers.js");
const { isUserCancelled, UserCancelled } = require("../core/errors.js");
const { presentForm, appkitBridge } = require("./appkit.js");
const { collectDialogSettings } = require("./dialogs.js");
const { defaultAnswers } = require("../core/form-rows.js");
const { normalizeSettings } = require("../core/settings.js");
const { encode, rememberedAnswers } = require("../core/preferences.js");
const { createMemory } = require("./preferences.js");

function defaultMemory() {
    return createMemory(globalThis.ObjC, globalThis.$);
}

/*
 * Which front end asks for the settings.
 *
 * The AppKit form is preferred and the stepwise dialogs are the fallback,
 * rather than the form replacing them. A probe run inside ShortcutsMacHelper
 * showed the form displays there without touching the activation policy, but
 * that is a fact about this macOS, not a guarantee about the next one, and a
 * tool whose interface disappears is worse than one that asks six questions.
 */

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
function collectViaForm(bridge, present, opening = {}) {
    // Nothing wrong yet, and answers only if the last run left any. What an
    // absent set shows is formSpec's to say: stating the defaults again here
    // would be a second copy of them, free to drift from the first.
    let state = { ...opening };

    for (;;) {
        const round = formRound(bridge, present, state);

        if (round.unavailable) {
            return null;
        }

        if (round.settings) {
            return round.settings;
        }

        state = { ...round, count: opening.count };
    }
}

/*
 * A cancellation is an answer and must be honoured. Anything else the form
 * throws is treated as the form being unusable, because falling back to
 * dialogs that work is better than failing the run over a widget.
 */
function attemptForm(bridge, present, opening) {
    try {
        return collectViaForm(bridge, present, opening);
    } catch (error) {
        if (isUserCancelled(error)) {
            throw error;
        }

        return null;
    }
}

/*
 * The opening state of both front ends: how many images were found, and the
 * answers to start from when the last run left some. They are the same
 * answers either way -- a form that cannot be shown must not also forget.
 */
function collectSettings(
    app,
    opening = {},
    bridge = appkitBridge(globalThis.ObjC, globalThis.$),
    present = presentForm
) {
    if (bridge) {
        const settings = attemptForm(bridge, present, opening);

        if (settings) {
            return settings;
        }
    }

    return collectDialogSettings(app, opening.answers ?? defaultAnswers());
}

/*
 * A configuration file is the whole of what a headless run is told, and it
 * has to mean the same thing every time it is used. So nothing is read from
 * the last run and nothing is written for the next -- and nothing is even
 * opened: the memory arrives as something to open rather than something
 * already open, and this branch returns before it can be.
 *
 * Which branch is taken is what the invocation says it is, never what the
 * settings look like. Reading it off them -- "there are none, so somebody
 * must be here to ask" -- is a guess, and a configuration file holding
 * `false` or `0` got it wrong: a headless run opened a dialog and waited for
 * an answer nobody was there to give.
 */
function settingsFor(app, invocation, count, openMemory = defaultMemory) {
    if (invocation.headless) {
        return normalizeSettings(invocation.settings);
    }

    const memory = openMemory();
    const settings = normalizeSettings(
        collectSettings(app, { count, answers: memory && rememberedAnswers(memory.recall()) })
    );

    if (memory) {
        // Confirmed and valid, and before any image is touched: a preference
        // is not made wrong by a photograph that fails to convert later.
        memory.remember(encode(settings));
    }

    return settings;
}

module.exports = { collectViaForm, collectSettings, settingsFor };
