"use strict";

const { APP_NAME } = require("../core/version.js");
const { formatDuration } = require("../core/numbers.js");
const {
    errorMessage,
    isUserCancelled,
    describeForLog
} = require("../core/errors.js");
const { isHeadlessInput } = require("../core/invocation.js");
const { makeTimestamp } = require("../core/naming.js");
const { checkTools } = require("./preflight.js");
const { reportNoImages, reportResult } = require("./reporting.js");
const { settingsFor } = require("./settings-form.js");
const { collectInvocation } = require("./input.js");
const { collectImageFiles } = require("./admission.js");
const { createTree } = require("./tree.js");
const { createProgress, unitsOf } = require("./progress.js");
const { createRenamer } = require("./exclusive-rename.js");
const { createJob, runJob } = require("./job.js");

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
 */
function prepare(app, input, headless) {
    const tools = checkTools(app);
    const invocation = collectInvocation(app, input, headless);

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

function prepareJob(app, invocation, tools, count) {
    return createJob(
        app,
        settingsFor(app, invocation, count),
        invocation.timestamp || makeTimestamp(new Date()),
        tools
    );
}

/*
 * Nothing is reported to a caller that is reading a receipt.
 */
function reportingJob(app, invocation, tools, work) {
    const images = work.images.length;
    const job = prepareJob(app, invocation, tools, images);

    job.rename = createRenamer(globalThis.ObjC, globalThis.$);
    job.progress = work.headless
        ? job.progress
        : createProgress({ units: unitsOf(job.settings, images), images });

    return job;
}

function execute(app, input, headless) {
    const startedAt = new Date();
    const { tools, invocation, selection } = prepare(app, input, headless);
    const { images, rejected } = selection;

    if (images.length === 0) {
        return reportNoImages(app, headless, rejected);
    }

    const job = reportingJob(app, invocation, tools, { images, headless });
    const result = runJob(job, images);

    result.elapsed = formatDuration(new Date() - startedAt);
    // Carried into the report: a file that was asked for and not converted is
    // part of the outcome, not something to leave out of it. Kept as entries
    // rather than sentences, so a headless caller can read the reason.
    result.rejected = rejected;

    return reportResult(app, job, result, { headless, pageCount: images.length });
}

// osascript calls run with this exact two-argument signature; the second
// parameter is unused here but must remain part of the signature.
// eslint-disable-next-line no-unused-vars
function run(input, parameters) {
    const app = Application.currentApplication();
    const headless = isHeadlessInput(input);

    app.includeStandardAdditions = true;

    try {
        return execute(app, input, headless);
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
