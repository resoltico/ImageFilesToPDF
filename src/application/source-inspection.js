"use strict";
const { message } = require("../core/messages.js");
const { OperationError, isUserCanceled, diagnosticText, commandOf } = require("../core/errors.js");
const { issuesOf, ISSUE } = require("../core/outcomes.js");
const { sourceIssues } = require("../core/source-policy.js");
const { unknownFormatCode } = require("../core/raster-signatures.js");
const { REQUIRED_FIELDS, OPTIONAL_FIELDS, readMetadata, readMetadataBatch, rawMetadata, finishMetadata,
    optionalValue, scalarValues, fieldAbsent, headerFailureCode } = require("../backend/metadata.js");
const { buildHeaderArgv, buildFieldArgv, headerGroups } = require("../backend/headers.js");
const { inspectSelection } = require("./inspection.js");

function expectedHeaderFailure(caught) {
    const error = caught;
    const [issue] = issuesOf(error, "inspection");
    if (isUserCanceled(error) || issue.code === ISSUE.fault) { throw error; }
    return { error, issue };
}

function failedInspection(caught) {
    const { error, issue } = expectedHeaderFailure(caught);
    return { problem: issue.code === "damaged" ? "damaged" : headerFailureCode(diagnosticText(error)),
        diagnostic: { ...issue.diagnostic, message: diagnosticText(error), command: commandOf(error) } };
}

async function pngFacts(sources, path, facts) {
    if (facts.format !== "PNG") { return facts; }
    try { return { ...facts, pages: await sources.pngCount(path) }; }
    catch (error) { return { ...facts, ...failedInspection(error), problem: "damaged" }; }
}

async function optionalField(app, tool, path, field) {
    try { return await app.run(buildFieldArgv(tool, field, [path]), message("operationCheckingOptionalMetadata")); }
    catch (error) {
        if (fieldAbsent(diagnosticText(error), field)) { return undefined; }
        throw error;
    }
}

async function scalarFacts(app, tool, path) {
    const fields = {};
    for (const field of REQUIRED_FIELDS) {
        // eslint-disable-next-line no-await-in-loop -- Native inspection completes in field order.
        fields[field] = (await app.run(buildFieldArgv(tool, field, [path]), message("operationCheckingMetadata"))).trim();
    }
    for (const field of OPTIONAL_FIELDS) {
        // eslint-disable-next-line no-await-in-loop -- Each optional fact can fail independently.
        const value = await optionalField(app, tool, path, field);
        if (value !== undefined) { fields[field] = value; }
    }
    return finishMetadata(rawMetadata(fields));
}

async function parsedHeader(app, tool, path) {
    try {
        const text = await app.run(buildHeaderArgv(tool, [path]), message("operationCheckingHeader"));
        return readMetadata(text, path);
    } catch (error) {
        expectedHeaderFailure(error);
        return null;
    }
}

/** Optional fields in a printable dump may be forged by multiline comments. */
async function confirmedOne(app, tool, path, parsed) {
    if (!parsed) { return scalarFacts(app, tool, path); }
    let { raw } = parsed;
    for (const field of parsed.optional) {
        // eslint-disable-next-line no-await-in-loop -- Complete this image's metadata before admitting it.
        raw = optionalValue(raw, field, await optionalField(app, tool, path, field));
    }
    return finishMetadata(raw);
}

async function readOne(app, tools, sources, { path, prefix }) {
    try {
        const reportedPath = app.toolPath(path);
        const parsed = await parsedHeader(app, tools.vipsheader, reportedPath);
        return pngFacts(sources, path, await confirmedOne(app, tools.vipsheader, reportedPath, parsed));
    } catch (error) {
        const failure = failedInspection(error);
        if (failure.problem !== "not-an-image") { return failure; }
        try { return { ...failure, problem: unknownFormatCode(await prefix()) }; }
        catch (unreadable) { return failedInspection(unreadable); }
    }
}

async function confirmBatch(app, tool, paths, parsed) {
    const raw = parsed.map((entry) => entry.raw);
    for (const field of OPTIONAL_FIELDS) {
        const indices = parsed.flatMap((entry, index) => entry.optional.includes(field) ? [index] : []);
        if (indices.length > 0) {
            // eslint-disable-next-line no-await-in-loop -- Scalar probes update distinct metadata fields in order.
            const text = await app.run(buildFieldArgv(tool, field, indices.map((index) => paths[index])), message("operationCheckingOptionalMetadata"));
            const values = scalarValues(text, indices.length);
            indices.forEach((index, position) => { raw[index] = optionalValue(raw[index], field, values[position]); });
        }
    }
    return raw.map(finishMetadata);
}

async function inspectBatch(app, tools, sources, entries) {
    const paths = entries.map((entry) => app.toolPath(entry.source.path));
    const text = await app.run(buildHeaderArgv(tools.vipsheader, paths), message("operationCheckingHeaders"));
    const parsed = paths.length === 1 ? [readMetadata(text, paths[0])] : readMetadataBatch(text, paths);
    const confirmed = await confirmBatch(app, tools.vipsheader, paths, parsed);
    const facts = [];
    for (const [index, image] of confirmed.entries()) {
        // eslint-disable-next-line no-await-in-loop -- Keep source observations and filesystem requests ordered.
        facts.push(await pngFacts(sources, entries[index].source.path, image));
    }
    return facts;
}

function batchesFor(app, tools, candidates) {
    const groups = headerGroups(tools.vipsheader, candidates.map((entry) => app.toolPath(entry.source.path)), app.fits);
    let offset = 0;
    return groups.map((paths) => {
        const batch = candidates.slice(offset, offset + paths.length);
        offset += paths.length;
        return batch;
    });
}

function inspectCandidates(app, selection, context) {
    const { tools, sources, progress } = context;
    const total = selection.images.length;
    return inspectSelection({
        begin: (count) => progress.expect({ units: count, images: count }),
        accessed: (done, count) => progress.checking(done, count, message("progressCheckingAccess")),
        checked: (done) => progress.checking(done, total),
        fileFacts: async (entry) => ({ ...await sources.facts(entry.path), readable: await sources.readable(entry.path) }),
        batches: (candidates) => batchesFor(app, tools, candidates),
        inspect: (entries) => inspectBatch(app, tools, sources, entries),
        inspectOne: ({ source, file }) => readOne(app, tools, sources,
            { path: source.path, prefix: () => sources.prefix(source.path, file) })
    }, selection);
}

/** The owned copy is always re-inspected, independently of admission. */
async function inspectCaptured(job, owned, original) {
    const { path, identity, version, prefix } = owned;
    const facts = await readOne(job.operations, job.tools, job.sources, { path, prefix: () => prefix });
    const issues = sourceIssues(facts);
    if (issues.length > 0) {
        const issue = { ...issues[0], source: original };
        const error = new OperationError(message("fileIssue", { path: original, reason: issue.message }), { issues: [issue] });
        throw error;
    }
    return { path, identity, version, ...facts };
}
module.exports = { inspectCandidates, inspectCaptured };
