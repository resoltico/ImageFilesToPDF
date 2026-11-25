"use strict";
const { normalizeInvocationInput } = require("../invocation-syntax.js");

function finderSelection() { return Application("Finder").selection(); }

// Shortcuts passes JXA Paths, path strings, and one plain record of parameters.
function isParametersRecord(item) {
    return typeof item === "object" && String(item) === "[object Object]";
}

function collectInvocation(app, input) {
    const selected = normalizeInvocationInput(input).filter((item) => !isParametersRecord(item));
    return { timestamp: "", inputItems: selected.length > 0 ? selected : finderSelection() };
}
module.exports = { collectInvocation };
