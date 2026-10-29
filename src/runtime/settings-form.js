"use strict";
const { hostError } = require("./cancellation.js");

const { formSpec } = require("./form.js");
const { readAnswers } = require("./answers.js");
const { UserCancelled } = require("../core/errors.js");
const { appkitBridge } = require("./objc-bridge.js");
const { presentForm } = require("./appkit.js");
const { collectDialogSettings } = require("./dialogs.js");
const { defaultAnswers } = require("./form-rows.js");
const { encode, rememberedAnswers } = require("./settings-preferences.js");
const { createMemory } = require("./preferences.js");

function defaultMemory() {
    return createMemory(globalThis.ObjC, globalThis.$);
}

/*
 * Which front end asks for the settings.
 *
 * The AppKit form is preferred and the stepwise dialogs are the fallback. A
 * probe inside ShortcutsMacHelper showed the form displays there without
 * touching the activation policy -- as a modal session, which is why it is no
 * evidence about the progress panel -- and that is this macOS, not the next.
 */

/*
 * One pass: present, and report what came back as either unusable (null),
 * the settings, or the answers to try again with and what is wrong with them.
 *
 * A cancellation is an answer and must be honoured. Anything else the form
 * throws remains a diagnostic. Only an explicit unavailable outcome falls
 * back; programming faults do not silently change interfaces.
 */
function formRound(bridge, present, state) {
    try {
        const outcome = present(
            bridge,
            formSpec(state.answers, state.problems, state.context)
        );

        if (!outcome) {
            return null;
        }

        if (outcome.cancelled) {
            throw new UserCancelled();
        }

        return { ...readAnswers(outcome.answers), answers: outcome.answers };
    } catch (caught) {
        throw hostError(caught);
    }
}

/*
 * Redisplayed with the previous answers and every problem at once, so
 * correcting a mistyped DPI does not mean answering the other five again.
 * A form that stops working part way hands the dialogs the answers last
 * submitted, not the ones it opened with: corrections already made are not
 * asked for twice. Edits never submitted are lost with the widget.
 */
function collectViaForm(bridge, present, opening = {}) {
    // Nothing wrong yet, and answers only if the last run left any. What an
    // absent set shows is formSpec's to say: stating the defaults again here
    // would be a second copy of them, free to drift from the first.
    let state = { ...opening };

    for (;;) {
        const round = formRound(bridge, present, state);

        if (!round) {
            return { answers: state.answers ?? defaultAnswers() };
        }

        if (round.settings) {
            return { settings: round.settings };
        }

        state = { ...state, ...round };
    }
}

/*
 * The opening state of both front ends: what was selected, and the answers
 * to start from when the last run left some. They are the same answers either
 * way -- a form that cannot be shown must not also forget.
 */
function collectSettings(
    app,
    opening = {},
    bridge = appkitBridge(globalThis.ObjC, globalThis.$),
    present = presentForm
) {
    const outcome = bridge
        ? collectViaForm(bridge, present, opening)
        : { answers: opening.answers ?? defaultAnswers() };

    return outcome.settings ?? collectDialogSettings(
        app, outcome.answers, opening.context
    );
}

/* Interactive collection returns the canonical record supplied by the common validator. */
function chooseSettings(app, context, injected = {}) {
    const { openMemory = defaultMemory, bridge, present } = injected;
    const memory = openMemory();
    const opening = { context, answers: rememberedAnswers(memory.recall()) };
    const settings = bridge || present
        ? collectSettings(app, opening, bridge, present) : collectSettings(app, opening);

    // Confirmed and valid, and before any image is touched: a preference is
    // not made wrong by a photograph that fails to convert later.
    memory.remember(encode(settings));
    context.diagnostics?.push(...(memory.diagnostics ?? []));

    return settings;
}

module.exports = { collectViaForm, collectSettings, chooseSettings };
