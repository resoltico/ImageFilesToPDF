"use strict";
const { hostError } = require("./cancellation.js");
const { APP_NAME } = require("../core/version.js");
const { formatDuration } = require("./formatting.js");
const { OperationError, isUserCancelled } = require("../core/errors.js");
const { failedRun, issuesOf } = require("../core/outcomes.js");
const { executeRun } = require("../application/run.js");
const { isHeadlessInput } = require("./invocation-syntax.js");
const { checkTools } = require("./preflight.js");
const { reportNoImages, reportResult, reportHeadless } = require("./reporting.js");
const { collectInvocation } = require("./input.js");
const { collectImageFiles } = require("./admission.js");
const { createTree } = require("./tree.js");
const { sourceAccess } = require("./source-capture.js");
const { nativePublication } = require("./native-publication.js");
const { openProgress } = require("./surfaces.js");
const { makeTimestamp } = require("../core/timestamps.js");
const { chooseSettings } = require("./settings-form.js");
const { reviewSelection } = require("./settings-review.js");
const { createJob, unitsOf, runJob } = require("./job.js");
const { showDetails } = require("./details-dialog.js");

function hostCapabilities() {
    const tree = createTree(globalThis.ObjC, globalThis.$, globalThis.Ref);
    return { tree, sources: sourceAccess(globalThis.ObjC, globalThis.$),
        publication: nativePublication(globalThis.ObjC, globalThis.$) };
}

function prepare(app, input, options) {
    options.report.phase("Checking required tools");
    const tools = checkTools(app);
    const invocation = collectInvocation(app, input, options.headless);
    const capabilities = options.capabilities ?? hostCapabilities();
    const { tree, sources, publication } = capabilities;
    if (!tree || !sources || !publication) { throw new OperationError("Required filesystem/source capabilities are unavailable."); }
    options.report.phase("Finding images");
    return { tools, invocation, ...capabilities, selection: collectImageFiles(app, invocation.inputItems, tree) };
}

function jobFor(app, request, settings, report) {
    const job = createJob(app, settings, request.invocation.timestamp || makeTimestamp(new Date()), request.tools);
    Object.assign(job, { sources: request.sources, publication: request.publication, progress: report });
    const images = request.selection.images.length;
    report.expect({ units: unitsOf(settings, images), images });
    return job;
}

function execute(app, input, options) {
    const { headless, report = openProgress(headless) } = options;
    const started = new Date();
    return executeRun({
        progress: report,
        prepare: () => prepare(app, input, { ...options, report }),
        noImages: (rejected) => { report.close(); return reportNoImages(app, headless, rejected); },
        review: (context) => reviewSelection(app, context),
        settings: (context) => chooseSettings(app, context),
        createJob: (request, settings) => jobFor(app, request, settings, report),
        convert: runJob,
        present(result) {
            result.elapsed = formatDuration(new Date() - started);
            return reportResult(app, result, { headless });
        }
    });
}

function runReported(app, input, headless) {
    const report = openProgress(headless);
    try { return execute(app, input, { headless, report }); }
    finally { report.close(); }
}

function handled(app, input, headless) {
    try { return runReported(app, input, headless); }
    catch (caught) {
        const outcome = caught?.outcome;
        const error = hostError(caught);
        if (headless) { return failedRun(error, outcome); }
        if (!isUserCancelled(error)) {
            showDetails(app, { title: APP_NAME, summary: "The request could not be completed.",
                detail: JSON.stringify({ outcome, issues: issuesOf(error, outcome ? "reporting" : "setup") }), buttons: ["OK"] });
        }
        return undefined;
    }
}

// The sole production export, adapted by src/entry.js for Shortcuts and osascript.
// eslint-disable-next-line no-unused-vars
function run(input, parameters) {
    const app = Application.currentApplication();
    const headless = isHeadlessInput(input);
    app.includeStandardAdditions = true;
    const result = handled(app, input, headless);
    return headless ? reportHeadless(result) : undefined;
}
module.exports = { run, execute };
