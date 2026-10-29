"use strict";
const { utf8Length, truncateToBytes } = require("./utf8.js");
const { fileStem, sanitizeFilename } = require("./paths.js");
const { readTimestamp } = require("./timestamps.js");
const MAXIMUM_SUFFIX = 10000;
const FILENAME_BUDGET_BYTES = 255;
const COLLISION_RESERVE_BYTES = 5;
const EXTENSION = ".pdf";

function outputNameForCombined(timestamp) {
    const text = readTimestamp(timestamp);
    const yearEnd = 4;
    const monthEnd = 6;
    const dayEnd = 8;
    const hourStart = 9;
    const hourEnd = 11;
    const minuteEnd = 13;
    return `Images ${text.slice(0, yearEnd)}-${text.slice(yearEnd, monthEnd)}-${text.slice(monthEnd, dayEnd)} at ` +
        `${text.slice(hourStart, hourEnd)}.${text.slice(hourEnd, minuteEnd)}.${text.slice(minuteEnd)}.pdf`;
}

function boundedStem(stem, suffix) {
    const budget = FILENAME_BUDGET_BYTES - utf8Length(suffix) - COLLISION_RESERVE_BYTES;
    const kept = truncateToBytes(stem, Math.max(budget, 0));
    return kept === stem ? stem : sanitizeFilename(kept);
}

function outputNameForSeparate(record, distinguish = false) {
    const dot = record.originalName.lastIndexOf(".");
    const extension = record.originalName.slice(dot + 1).toLowerCase();
    const suffix = `${distinguish ? `-${extension}` : ""}${EXTENSION}`;
    return `${boundedStem(sanitizeFilename(fileStem(record.originalName)), suffix)}${suffix}`;
}

function stemOf(path) {
    if (path.slice(-EXTENSION.length).toLowerCase() !== EXTENSION) { throw new Error(`Cannot generate a unique PDF path for: ${path}`); }
    return path.slice(0, -EXTENSION.length);
}

/** Existing entries are never replaced; exclusive publication applies every suffix. */
function collisionPath(initialPath, attempt) {
    return attempt === 1 ? initialPath : `${stemOf(initialPath)} ${attempt}${initialPath.slice(-EXTENSION.length)}`;
}

function stagedPdfPath(workspace, token) { return `${workspace}/staged-${sanitizeFilename(String(token))}.pdf`; }
module.exports = { collisionPath, MAXIMUM_SUFFIX, outputNameForCombined, outputNameForSeparate, stagedPdfPath };
