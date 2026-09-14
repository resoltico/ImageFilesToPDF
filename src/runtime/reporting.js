"use strict";

const { APP_NAME } = require("../core/version.js");
const { supportedFormatList } = require("../core/paths.js");
const { describeRejections, showCompletion } = require("./completion.js");
const {
    writeReceipt,
    isCompleteSuccess,
    describeIncomplete
} = require("./receipt.js");

/*
 * What a finished run tells its caller, in each of the two ways it can be
 * called.
 *
 * Only one of the two is answered with a value. A person has been told in a
 * dialog, so there is nothing left to hand back -- and handing back the list
 * of PDFs was not free. A Quick Action's result is the shortcut's result, and
 * Shortcuts writes a text result out as a file, named after the text with the
 * slashes turned into colons. Measured on the sibling project, whose
 * publication this shares: a run of five left five files called
 * ":Users:...:IMG_1538_stamped.txt" beside the photographs, each holding one
 * path, each carrying com.apple.shortcuts' own quarantine. Nobody asked for
 * them and nothing said they had been made.
 *
 * What is given up is chaining this action to another one inside a shortcut,
 * which would need the paths. INSTALL.txt builds a shortcut with one action,
 * and litter in somebody's folder is the worse default.
 */

/*
 * Nothing to convert, which is a different message depending on whether
 * anything was asked for. Selecting only a GIF is not the same as selecting
 * nothing, and saying "no images selected" to someone who selected one is how
 * a rejection becomes invisible.
 */
function describeNoImages(rejected) {
    if (rejected.length === 0) {
        return "No images selected.\n\nSelect one or more image files in " +
            `Finder, then run the action again.\n\nSupported: ${
                supportedFormatList()}.`;
    }

    return `Nothing to convert.\n\n${describeRejections(rejected)}`;
}

function reportNoImages(app, headless, rejected) {
    if (headless) {
        throw new Error(describeNoImages(rejected));
    }

    app.displayDialog(describeNoImages(rejected), {
        withTitle: APP_NAME,
        buttons: ["OK"],
        defaultButton: "OK"
    });
}

/*
 * A headless caller gets one thing back from osascript: the returned value on
 * success, the error on failure. An incomplete run has to be both, so the
 * receipt goes out on its own before the failure is raised — newline
 * terminated, because a caller reads it a line at a time.
 *
 * The writer is a parameter so the line that is actually written can be read
 * back in a test; the default is the real one.
 */
function reportHeadless(result, write = writeReceipt) {
    const receipt = JSON.stringify(result);

    if (isCompleteSuccess(result)) {
        return receipt;
    }

    write(`${receipt}\n`);

    throw new Error(describeIncomplete(result));
}

function reportResult(app, job, result, options) {
    if (options.headless) {
        return reportHeadless(result);
    }

    showCompletion(app, job.settings.mode, result, options.pageCount);

    // Said out loud rather than fallen off the end of: nothing is the answer
    // here, and the host does something with an answer.
    return undefined;
}

module.exports = {
    describeNoImages,
    reportNoImages,
    reportHeadless,
    reportResult
};
