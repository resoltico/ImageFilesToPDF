"use strict";
const { message } = require("../../core/messages.js");

const RADIX = 16;
const ESCAPE_DIGITS = 4;

function encodeHelperRequest(request, ascii = false) {
    const json = JSON.stringify(request);
    return ascii ? json.replace(/[^\p{ASCII}]/gu, (point) => point.split("").map((unit) =>
        `\\u${unit.charCodeAt(0).toString(RADIX).padStart(ESCAPE_DIGITS, "0")}`).join("")) : json;
}

function readHelperReply(line) {
    try { return JSON.parse(line); }
    catch { throw new Error(message("platformHelperReplyNotJson")); }
}

function windowsReply(value) {
    const object = value !== null && typeof value === "object" && !Array.isArray(value);
    if (!object || typeof value.ok !== "boolean") { throw new Error(message("windowsHelperInvalidReply")); }
    if (value.ok ? !Object.hasOwn(value, "value") : !Number.isInteger(value.code) || typeof value.diagnostic !== "string") {
        throw new Error(message("windowsHelperInvalidReply"));
    }
    return value;
}

module.exports = { encodeHelperRequest, readHelperReply, windowsReply };
