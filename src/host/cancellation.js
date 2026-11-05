"use strict";
const { UserCanceled } = require("../core/errors.js");
const CANCEL_ERROR_NUMBER = -128;
function hostError(error) {
    let current = error;
    const maximumDepth = 8;
    for (let depth = 0; current && depth < maximumDepth; depth += 1) {
        if (current.errorNumber === CANCEL_ERROR_NUMBER) {
            const canceled = new UserCanceled();
            canceled.cause = error;
            return canceled;
        }
        current = current.cause;
    }
    return error;
}
module.exports = { hostError };
