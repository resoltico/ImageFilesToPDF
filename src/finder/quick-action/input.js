"use strict";
const { normalizeInvocationInput } = require("../invocation-syntax.js");

function finderSelection() { return Application("Finder").selection(); }

function isParametersRecord(item) {
    try { return item !== null && typeof item === "object" && String(item) === "[object Object]"; }
    catch { return false; }
}

function collectInvocation(app, input) {
    const selected = normalizeInvocationInput(input).filter((item) => !isParametersRecord(item));
    return { timestamp: "", inputItems: selected.length > 0 ? selected : finderSelection() };
}
module.exports = { finderSelection, collectInvocation };
