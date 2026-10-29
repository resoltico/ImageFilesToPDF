"use strict";
/* eslint max-classes-per-file: ["error", 2] -- The domain has two error kinds: expected operation failure and cancellation. */

/*
 * Error classification. The runtime distinguishes a deliberate cancellation,
 * which must stay silent, from a genuine failure, which must be reported.
 */

// Deep enough for the wrapping this code does, and bounded so a cause that
// refers back to itself cannot spin.
const MAXIMUM_CAUSE_DEPTH = 8;

function errorMessage(error) {
    if (!error) {
        return "Unknown error";
    }

    if (error.message) {
        return String(error.message);
    }

    return String(error);
}

/*
 * Cancellation is a decision, not a phrase.
 *
 * This used to be read out of the message text, and every per-image failure
 * carries the name of the image it happened to -- so a file called
 * "User cancelled.jpg" that genuinely failed to convert looked exactly like
 * somebody pressing Cancel, and the run ended silently with no dialog at all.
 *
 * Host cancellation is translated into UserCancelled by its adapter before
 * entering the portable workflow.
 */
class OperationError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = "OperationError";
    }
}

class UserCancelled extends Error {
    constructor() {
        super("User cancelled.");
        this.name = "UserCancelled";
    }
}

/*
 * Read through the chain, not off the top.
 *
 * Every layer that adds context wraps the error it was given as a cause, and
 * a cancellation wrapped once stopped being one: the outermost error is a
 * plain Error about the stage that was running, and asking it alone turns a
 * deliberate stop into a photograph that failed to convert. commandOf, twelve
 * lines below, has always read the chain for the same reason. These are one
 * shape now rather than two.
 *
 * A false positive would end a run silently, so what it takes to be one is
 * exact: the domain UserCancelled. The bounded cause walk also handles
 * contextual wrappers without interpreting filenames or human messages.
 */
function isUserCancelled(error) {
    let current = error;

    for (let depth = 0; current && depth < MAXIMUM_CAUSE_DEPTH; depth += 1) {
        if (current instanceof UserCancelled) {
            return true;
        }

        current = current.cause;
    }

    return false;
}

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

module.exports = {
    OperationError,
    UserCancelled,
    errorMessage,
    commandOf,
    isUserCancelled
};
