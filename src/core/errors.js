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

/*
 * The command that failed is invaluable in a log and noise in a dialog: a
 * person who right-clicked in Finder is not going to debug an argv, and it
 * buries the one line that matters underneath it.
 */
function describeForLog(error) {
    const command = error && error.command;

    return command
        ? `${errorMessage(error)}\n\nCommand:\n${command}`
        : errorMessage(error);
}

module.exports = {
    errorMessage,
    isUserCancelled,
    summarizeCommand,
    describeForLog
};
