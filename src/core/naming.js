"use strict";

const { zeroPad } = require("./numbers.js");
const { fileStem, sanitizeFilename } = require("./paths.js");

/*
 * Output filename construction and collision avoidance.
 */

const TIMESTAMP_FIELD_WIDTH = 2;
const FIRST_SUFFIX = 2;
const MAXIMUM_SUFFIX = 10000;

function makeTimestamp(date) {
    const pad = (value) => zeroPad(value, TIMESTAMP_FIELD_WIDTH);

    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
        "_",
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join("");
}

function outputNameForCombined(timestamp) {
    return `output_${timestamp}.pdf`;
}

function outputNameForSeparate(record, timestamp) {
    return `${sanitizeFilename(fileStem(record.originalName))}_${timestamp}.pdf`;
}

/*
 * Never overwrite: append _2, _3 and so on until the path is free. The caller
 * supplies the existence predicate so this stays pure.
 */
function nextUniquePath(initialPath, exists) {
    if (!exists(initialPath)) {
        return initialPath;
    }

    const match = /^(?<stem>.*?)(?<extension>\.pdf)$/iu.exec(initialPath);

    if (!match) {
        throw new Error(`Cannot generate a unique PDF path for: ${initialPath}`);
    }

    for (let suffix = FIRST_SUFFIX; suffix < MAXIMUM_SUFFIX; suffix += 1) {
        const candidate = `${match.groups.stem}_${suffix}${match.groups.extension}`;

        if (!exists(candidate)) {
            return candidate;
        }
    }

    throw new Error("Could not create a unique output filename.");
}

/*
 * Where the PDF is built before it is published.
 *
 * Inside the workspace rather than beside the images, which was measured
 * rather than chosen for tidiness: a Shortcuts helper could neither rename
 * nor even read a file pdfcpu had created in the user's Downloads folder,
 * while a file the shell itself created there could be renamed freely and
 * copying into that folder from the workspace was allowed throughout.
 * Nothing is written into the output folder now except the finished PDF.
 */
function stagedPdfPath(workspace, token) {
    return `${workspace}/staged-${sanitizeFilename(String(token))}.pdf`;
}

module.exports = {
    makeTimestamp,
    outputNameForCombined,
    outputNameForSeparate,
    nextUniquePath,
    stagedPdfPath
};
