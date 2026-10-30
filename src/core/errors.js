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
