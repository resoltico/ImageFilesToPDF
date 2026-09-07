"use strict";

const { zeroPad, utf8Length, truncateToBytes } = require("./numbers.js");
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

/*
 * What one filename may be, in bytes.
 *
 * A path component is 255 bytes on the filesystems macOS puts a Mac's files
 * on -- HFS Plus documents 255 characters, APFS 255 UTF-8 characters, and
 * bytes is the bound that satisfies both. Nothing truncates a name that is
 * over it: the write fails with a complaint about the length, which is a poor
 * answer to "convert this photograph", and a valid source name can produce
 * one because the output name is longer than the name it came from.
 *
 * The suffix is measured rather than assumed, because a headless caller
 * supplies its own timestamp. Room is left for the collision suffix as well:
 * a name that fits only until it needs _2 is a name that fits until the
 * second run.
 */
const FILENAME_BUDGET_BYTES = 255;
const COLLISION_RESERVE_BYTES = 5;

function boundedStem(stem, suffix) {
    const budget =
        FILENAME_BUDGET_BYTES - utf8Length(suffix) - COLLISION_RESERVE_BYTES;
    const kept = truncateToBytes(stem, Math.max(budget, 0));

    // Cutting can leave the trailing underscore or dot that sanitizing exists
    // to remove, so what is left goes through it again.
    return kept === stem ? stem : sanitizeFilename(kept);
}

function outputNameForSeparate(record, timestamp) {
    const suffix = `_${timestamp}.pdf`;
    const stem = sanitizeFilename(fileStem(record.originalName));

    return `${boundedStem(stem, suffix)}${suffix}`;
}

const EXTENSION = ".pdf";

/*
 * The name without its extension.
 *
 * Read off the end rather than matched. A pattern over the whole path made
 * the directories part of the question: a folder with a newline in its name
 * -- which is a legal folder, and which this action handles everywhere else
 * -- stopped the pattern reaching the extension at all, and a second file of
 * the same name could not be given its suffix.
 */
function stemOf(path) {
    const tail = path.slice(-EXTENSION.length);

    if (tail.toLowerCase() !== EXTENSION) {
        throw new Error(`Cannot generate a unique PDF path for: ${path}`);
    }

    return path.slice(0, -EXTENSION.length);
}

/*
 * Never overwrite: append _2, _3 and so on until the path is free. The caller
 * supplies the existence predicate so this stays pure.
 */
function nextUniquePath(initialPath, exists) {
    if (!exists(initialPath)) {
        return initialPath;
    }

    const stem = stemOf(initialPath);

    for (let suffix = FIRST_SUFFIX; suffix < MAXIMUM_SUFFIX; suffix += 1) {
        const candidate = `${stem}_${suffix}${initialPath.slice(-EXTENSION.length)}`;

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
