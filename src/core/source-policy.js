"use strict";
const { ISSUE } = require("./outcomes.js");
const { SUPPORTED_FORMATS, basename, supportedFormatList } = require("./paths.js");
const RASTER_FAMILIES = new Set(SUPPORTED_FORMATS.map((format) => format.family ?? format.name));
const FIRST_TURNED = 5;
const LAST_ORIENTATION = 8;

function sourceIssue(code, facts = {}, diagnostic = null) {
    const messages = {
        unreadable: facts.unavailable ? "This file cannot be read; check that it still exists and that you have access."
            : "This file cannot be read (permission denied).",
        empty: "This file is empty.",
        "not-an-image": "This file is not a supported still raster image.",
        "unsupported-content": `This image uses unsupported content; use ${supportedFormatList()}.`,
        "multiple-images": `This file contains ${facts.pages} images; only single images are supported.`,
        damaged: "This image is damaged or incomplete."
    };
    if (!Object.hasOwn(messages, code)) { throw new Error("Unknown source issue code."); }
    return { code, stage: "inspection", message: messages[code], ...(diagnostic ? { diagnostic } : {}) };
}

function sourceFileIssue(facts) {
    if (facts.readable !== true) { return sourceIssue("unreadable"); }
    if (typeof facts.size !== "string" || !/^\d+$/u.test(facts.size)) { return sourceIssue("unreadable", { unavailable: true }); }
    return Number(facts.size) === 0 ? sourceIssue("empty") : null;
}

function sourceIssues(descriptor) {
    if (descriptor.problem) { return [sourceIssue(descriptor.problem, descriptor, descriptor.diagnostic)]; }
    if (!RASTER_FAMILIES.has(descriptor.format)) {
        const vector = !descriptor.loader || /^(?:svg|pdf)/u.test(descriptor.loader);
        return [sourceIssue(vector ? "not-an-image" : "unsupported-content")];
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
    return { code: ISSUE.operation, stage: "capture", source: path, message: "This file could not be copied for conversion.", diagnostic };
}

function changedSourceIssue(path, diagnostic = null) {
    return { code: ISSUE.operation, stage: "capture", source: path,
        message: "The source changed after selection; try again when it is stable.", ...(diagnostic ? { diagnostic } : {}) };
}
module.exports = { sourceIssue, sourceFileIssue, sourceIssues, orientedSize, sourceRefusal, matchesAdmission, captureIssue, changedSourceIssue };
