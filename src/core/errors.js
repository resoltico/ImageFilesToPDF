"use strict";
/* eslint max-classes-per-file: ["error", 3] -- Issue-carrying faults, expected operation failures and cancellation share constructor fields. */

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

class IssueError extends Error {
    constructor(message, options = {}) {
        super(message, options);
        for (const field of ["issues", "recovery", "command", "outcome"]) {
            if (Object.hasOwn(options, field)) { this[field] = options[field]; }
        }
        this.stack = options.stack ?? this.stack;
    }
}

class OperationError extends IssueError {
    constructor(message, options) {
        super(message, options);
        this.name = "OperationError";
    }
}

class UserCanceled extends IssueError {
    constructor(options) {
        super("User canceled.", options);
        this.name = "UserCanceled";
    }
}

// Each layer adds context through cause; inspect outermost first and keep the
// traversal bounded even when a malformed chain refers back to itself.
function causes(error) {
    const chain = [];
    let current = error;
    for (let depth = 0; current && depth < MAXIMUM_CAUSE_DEPTH; depth += 1) {
        chain.push(current);
        current = current.cause;
    }
    return chain;
}

function isUserCanceled(error) {
    return causes(error).some((each) => each instanceof UserCanceled);
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
    const carried = causes(error).find((each) => each.command);
    return carried ? String(carried.command) : "";
}

module.exports = {
    IssueError,
    OperationError,
    UserCanceled,
    errorMessage,
    causes,
    commandOf,
    isUserCanceled
};
