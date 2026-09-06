"use strict";

/*
 * The interactive front end: settings collection and the completion report.
 */

const { APP_NAME, VERSION } = require("../core/version.js");
const { plural } = require("../core/numbers.js");
const { dirname } = require("../core/paths.js");
const {
    PAPER_SIZE,
    ORIENTATION,
    OUTPUT_MODE,
    BACKGROUND,
    RESOLUTION,
    QUALITY,
    labelsOf,
    defaultLabelOf,
    valueOfLabel
} = require("../core/choices.js");
const MAXIMUM_SHOWN_FAILURES = 12;

/*
 * Presents the labels and returns the value behind the one chosen, so the
 * wording a person sees is never the thing the pipeline stores.
 */
function chooseRequired(app, control) {
    const choice = app.chooseFromList(labelsOf(control), {
        withTitle: APP_NAME,
        withPrompt: control.prompt,
        defaultItems: [defaultLabelOf(control)]
    });

    if (!choice) {
        throw new Error("User cancelled.");
    }

    return valueOfLabel(control, choice[0]);
}

function promptInteger(app, control) {
    const { prompt, defaultAnswer, minimum, maximum } = control;

    for (;;) {
        const response = app.displayDialog(prompt, {
            withTitle: APP_NAME,
            defaultAnswer,
            buttons: ["Cancel", "OK"],
            defaultButton: "OK",
            cancelButton: "Cancel"
        });
        const text = String(response.textReturned).trim();

        if (/^\d+$/u.test(text)) {
            const value = parseInt(text, 10);

            if (value >= minimum && value <= maximum) {
                return value;
            }
        }

        app.displayDialog(
            `Please enter a whole number from ${minimum} to ${maximum}.`,
            { withTitle: APP_NAME, buttons: ["OK"], defaultButton: "OK" }
        );
    }
}

function collectDialogSettings(app) {
    return {
        paperSize: chooseRequired(app, PAPER_SIZE),
        orientation: chooseRequired(app, ORIENTATION),
        dpi: promptInteger(app, RESOLUTION),
        quality: promptInteger(app, QUALITY),
        mode: chooseRequired(app, OUTPUT_MODE),
        background: chooseRequired(app, BACKGROUND)
    };
}

function describeFailures(failures) {
    const shown = failures.slice(0, MAXIMUM_SHOWN_FAILURES);

    if (failures.length > shown.length) {
        shown.push(`...and ${failures.length - shown.length} more failure(s).`);
    }

    return shown.join("\n");
}

function versionLine() {
    return `\n${APP_NAME} ${VERSION}`;
}

/*
 * Every completion says the same three things in the same order: what was
 * produced, where it went, and how long it took. Producing files without
 * saying where they are is the one thing this dialog exists to prevent.
 */
function completionMessage(mode, result, pageCount) {
    if (result.failures.length > 0) {
        return [
            `Finished with errors.\n`,
            `Created: ${plural(result.outputs.length, "PDF")}`,
            `Failed: ${result.failures.length}`,
            `Elapsed: ${result.elapsed}\n`,
            describeFailures(result.failures),
            versionLine()
        ].join("\n");
    }

    if (mode === "single") {
        return [
            `Created one PDF from ${plural(pageCount, "image")}.\n`,
            result.outputs[0],
            `\nElapsed: ${result.elapsed}`,
            versionLine()
        ].join("\n");
    }

    return [
        `Created ${plural(result.outputs.length, "PDF")}.\n`,
        dirname(result.outputs[0]),
        `\nElapsed: ${result.elapsed}`,
        versionLine()
    ].join("\n");
}

function showCompletion(app, mode, result, pageCount) {
    app.displayDialog(completionMessage(mode, result, pageCount), {
        withTitle: APP_NAME,
        buttons: ["OK"],
        defaultButton: "OK"
    });
}

module.exports = {
    chooseRequired,
    promptInteger,
    collectDialogSettings,
    completionMessage,
    showCompletion
};
