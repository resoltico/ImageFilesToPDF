"use strict";
const { UserCancelled } = require("../core/errors.js");
const CANCEL_ERROR_NUMBER = -128;
function hostError(error) {
    let current = error;
    const maximumDepth = 8;
    for (let depth = 0; current && depth < maximumDepth; depth += 1) {
        if (current.errorNumber === CANCEL_ERROR_NUMBER) {
            const cancelled = new UserCancelled();
            cancelled.cause = error;
            return cancelled;
        }
        current = current.cause;
    }
    return error;
}
module.exports = { hostError };
