"use strict";

const { APP_NAME } = require("../core/version.js");
const { formatDuration } = require("../core/numbers.js");
const {
    errorMessage,
    isUserCancelled,
    describeForLog
} = require("../core/errors.js");
const { isHeadlessInput } = require("../core/invocation.js");
const { checkTools } = require("./preflight.js");
const { reportNoImages, reportResult } = require("./reporting.js");
const { collectInvocation } = require("./input.js");
const { collectImageFiles } = require("./admission.js");
const { createTree } = require("./tree.js");
const { openProgress } = require("./surfaces.js");
const { reportingJob, runJob } = require("./job.js");

/*
 * Entry point and orchestration.
 *
 * Shortcuts calls run(input, parameters). In headless mode errors propagate so
 * a caller sees a non-zero exit; interactively they become a dialog.
 */


/*
 * Nothing is asked of the user until everything that can be checked cheaply
 * has been: the tools must be installed and usable, and there must be images
 * to convert. Asking six questions and then reporting a missing tool wastes
 * every answer.
 *
 * Cheap is not the same as instant. A selection of folders is walked here, and
 * a walk of a large one is the longest a run can go without saying anything --
 * which is why the report exists before this is called rather than after it.
 */
function prepare(app, input, headless, report) {
    report.phase("Checking required tools");

    const tools = checkTools(app);
    const invocation = collectInvocation(app, input, headless);

    report.phase("Finding images");

    return {
        tools,
        invocation,
        selection: collectImageFiles(
            app,
            invocation.inputItems,
            createTree(globalThis.ObjC, globalThis.$, globalThis.Ref)
        )
    };
}

/*
 * What a run does once it knows it has something to convert.
 *
 * The report is closed before anything is displayed. A panel at the floating
 * window level sits above a dialog, so a report still on screen when the
 * completion message arrives is a report in front of the answer.
 */
function convert(app, prepared, report, startedAt) {
    const { invocation, tools, selection } = prepared;
    const { images, rejected } = selection;

    // A question is about to be asked, and the answer takes as long as it
    // takes. Pausing also re-arms the delay, so a conversion quick enough to
    // need no window still does not get one.
    report.pause();

    const job = reportingJob(app, invocation, tools, { images, report });
    const result = runJob(job, images);

    result.elapsed = formatDuration(new Date() - startedAt);
    // Carried into the report: a file that was asked for and not converted is
    // part of the outcome, not something to leave out of it. Kept as entries
    // rather than sentences, so a headless caller can read the reason.
    result.rejected = rejected;
    report.close();

    return reportResult(app, job, result, {
        headless: invocation.headless,
        pageCount: images.length
    });
}

function execute(app, input, headless, report = openProgress(headless)) {
    const startedAt = new Date();
    const prepared = prepare(app, input, headless, report);
    const { images, rejected } = prepared.selection;

    if (images.length === 0) {
        report.close();

        return reportNoImages(app, headless, rejected);
    }

    return convert(app, prepared, report, startedAt);
}

/*
 * The guarantee behind the sentence above: whatever happens in there, the
 * report is closed before the error dialog this returns into.
 */
function runReported(app, input, headless) {
    const report = openProgress(headless);

    try {
        return execute(app, input, headless, report);
    } finally {
        report.close();
    }
}

// osascript calls run with this exact two-argument signature; the second
// parameter is unused here but must remain part of the signature.
// eslint-disable-next-line no-unused-vars
function run(input, parameters) {
    const app = Application.currentApplication();
    const headless = isHeadlessInput(input);

    app.includeStandardAdditions = true;

    try {
        return runReported(app, input, headless);
    } catch (error) {
        if (headless) {
            // stderr, where the failing command is worth having.
            throw new Error(describeForLog(error), { cause: error });
        }

        if (!isUserCancelled(error)) {
            app.displayDialog(errorMessage(error), {
                withTitle: APP_NAME,
                buttons: ["OK"],
                defaultButton: "OK"
            });
        }

        return [];
    }
}

module.exports = { run, execute };
