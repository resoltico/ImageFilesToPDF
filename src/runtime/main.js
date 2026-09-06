"use strict";

const { APP_NAME } = require("../core/version.js");
const { formatDuration } = require("../core/numbers.js");
const {
    errorMessage,
    isUserCancelled,
    describeForLog
} = require("../core/errors.js");
const { isHeadlessInput } = require("../core/invocation.js");
const { normalizeSettings } = require("../core/settings.js");
const { makeTimestamp } = require("../core/naming.js");
const { supportedFormatList } = require("../core/paths.js");
const { checkTools } = require("./preflight.js");
const { showCompletion } = require("./dialogs.js");
const { collectSettings } = require("./settings-form.js");
const { collectImageFiles, collectInvocation } = require("./input.js");
const { createJob, runJob } = require("./job.js");

/*
 * Entry point and orchestration.
 *
 * Shortcuts calls run(input, parameters). In headless mode errors propagate so
 * a caller sees a non-zero exit; interactively they become a dialog.
 */

function reportNoImages(app, headless) {
    if (headless) {
        throw new Error(
            `No image files were supplied. Supported: ${supportedFormatList()}.`
        );
    }

    app.displayDialog(
        "No images selected.\n\nSelect one or more image files in Finder, " +
        `then run the action again.\n\nSupported: ${supportedFormatList()}.`,
        { withTitle: APP_NAME, buttons: ["OK"], defaultButton: "OK" }
    );

    return [];
}

function reportResult(app, job, result, options) {
    if (options.headless) {
        return JSON.stringify(result);
    }

    showCompletion(app, job.settings.mode, result, options.pageCount);

    return result.outputs;
}

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
        imageFiles: collectImageFiles(app, invocation.inputItems)
    };
}

function execute(app, input, headless) {
    const startedAt = new Date();
    const { tools, invocation, imageFiles } = prepare(app, input, headless);

    if (imageFiles.length === 0) {
        return reportNoImages(app, headless);
    }

    const settings = normalizeSettings(
        invocation.settings ?? collectSettings(app)
    );
    const job = createJob(
        app,
        settings,
        invocation.timestamp || makeTimestamp(new Date()),
        tools
    );
    const result = runJob(job, imageFiles);

    result.elapsed = formatDuration(new Date() - startedAt);

    return reportResult(app, job, result, { headless, pageCount: imageFiles.length });
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
