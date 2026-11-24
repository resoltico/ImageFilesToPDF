"use strict";
const { ISSUE } = require("./outcomes.js");
const { issueMessage } = require("./messages.js");
const { basename } = require("./paths.js");
const { SUPPORTED_FORMATS, supportedFormatList } = require("./formats.js");
const RASTER_FAMILIES = new Set(SUPPORTED_FORMATS.map((format) => format.family));
const FIRST_TURNED = 5;
const LAST_ORIENTATION = 8;

function sourceIssue(code, facts = {}, diagnostic = null) {
    const messages = {
        unreadable: facts.unavailable ? "sourceUnavailable" : "sourcePermissionDenied",
        empty: "sourceEmpty",
        "not-an-image": "sourceNotImage",
        "unsupported-content": "sourceUnsupportedContent",
        "multiple-images": "sourceMultipleImages",
        damaged: "sourceDamaged"
    };
    if (!Object.hasOwn(messages, code)) { throw new Error("Unknown source issue code."); }
    const params = { ...code === "multiple-images" ? { pages: facts.pages } : {},
        ...code === "unsupported-content" ? { formats: supportedFormatList() } : {} };
    return { ...issueMessage(code, "inspection", messages[code], params), ...(diagnostic ? { diagnostic } : {}) };
}

function sourceFileIssue(facts) {
    if (facts.readable !== true) { return sourceIssue("unreadable"); }
    if (typeof facts.size !== "string" || !/^\d+$/u.test(facts.size)) { return sourceIssue("unreadable", { unavailable: true }); }
    return Number(facts.size) === 0 ? sourceIssue("empty") : null;
}

function sourceIssues(descriptor) {
    if (descriptor.problem) { return [sourceIssue(descriptor.problem, descriptor, descriptor.diagnostic)]; }
    if (!RASTER_FAMILIES.has(descriptor.format)) {
        return [sourceIssue("not-an-image")];
    }
    if (![descriptor.width, descriptor.height, descriptor.bands, descriptor.pages, descriptor.orientation]
        .every((value) => Number.isSafeInteger(value) && value > 0) || descriptor.orientation > LAST_ORIENTATION) {
        return [sourceIssue("damaged")];
    }
    return descriptor.pages === 1 ? [] : [sourceIssue("multiple-images", descriptor)];
}

function orientedSize(width, height, orientation) {
    return orientation >= FIRST_TURNED && orientation <= LAST_ORIENTATION
        ? { width: height, height: width } : { width, height };
}

function sourceRefusal(path, issue) {
    return { path, name: basename(path), reason: issue.message, code: issue.code, stage: issue.stage,
        ...(issue.diagnostic ? { diagnostic: issue.diagnostic } : {}) };
}

/** Both native identity/version and every inspected image fact must remain the same. */
function matchesAdmission(admission, captured) {
    return Boolean(admission?.image?.format) && admission.identity === captured.identity && admission.version === captured.version &&
        Object.entries(admission.image).every(([field, value]) => captured[field] === value);
}

function captureIssue(path, diagnostic) {
    return { source: path, ...issueMessage(ISSUE.operation, "capture", "sourceCaptureFailed"), diagnostic };
}

function changedSourceIssue(path, diagnostic = null) {
    return { source: path, ...issueMessage(ISSUE.operation, "capture", "sourceChanged"), ...(diagnostic ? { diagnostic } : {}) };
}
module.exports = { sourceIssue, sourceFileIssue, sourceIssues, orientedSize, sourceRefusal, matchesAdmission, captureIssue, changedSourceIssue };
