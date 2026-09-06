"use strict";

/*
 * Error classification. The runtime distinguishes a deliberate cancellation,
 * which must stay silent, from a genuine failure, which must be reported.
 */

const CANCEL_ERROR_NUMBER = -128;
const MAX_COMMAND_LENGTH = 4000;
const COMMAND_HEAD_LENGTH = 2000;
const COMMAND_TAIL_LENGTH = 1000;

function errorMessage(error) {
    if (!error) {
        return "Unknown error";
    }

    if (error.message) {
        return String(error.message);
    }

    return String(error);
}

function isUserCancelled(error) {
    const message = errorMessage(error);

    return (
        message.includes("User cancelled") ||
        message.includes("User canceled") ||
        Boolean(error && error.errorNumber === CANCEL_ERROR_NUMBER)
    );
}

/*
 * A failing command is shown to the user in a dialog. A long argument list
 * would make that dialog unreadable, so the middle is elided.
 */
function summarizeCommand(command) {
    const text = String(command);

    if (text.length <= MAX_COMMAND_LENGTH) {
        return text;
    }

    return [
        text.slice(0, COMMAND_HEAD_LENGTH),
        "...[command truncated]...",
        text.slice(text.length - COMMAND_TAIL_LENGTH)
    ].join("\n\n");
}

// Deep enough for the wrapping this code does, and bounded so a cause that
// refers back to itself cannot spin.
const MAXIMUM_CAUSE_DEPTH = 8;

/*
 * The failing command, wherever it is in the chain.
 *
 * Only the innermost error carries it, and every layer that adds context
 * wraps that error as a cause. Reading the outermost error alone therefore
 * finds nothing, and the one detail worth having in a log is the one that
 * disappears.
 */
function commandOf(error) {
    let current = error;

    for (let depth = 0; current && depth < MAXIMUM_CAUSE_DEPTH; depth += 1) {
        if (current.command) {
            return String(current.command);
        }

        current = current.cause;
    }

    return "";
}

/*
 * The command that failed is invaluable in a log and noise in a dialog: a
 * person who right-clicked in Finder is not going to debug an argv, and it
 * buries the one line that matters underneath it.
 */
function describeForLog(error) {
    const command = commandOf(error);

    return command
        ? `${errorMessage(error)}\n\nCommand:\n${command}`
        : errorMessage(error);
}

module.exports = {
    errorMessage,
    commandOf,
    isUserCancelled,
    summarizeCommand,
    describeForLog
};
