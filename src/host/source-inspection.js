"use strict";
const { hostError } = require("./cancellation.js");
const { OperationError, isUserCancelled, errorMessage, commandOf } = require("../core/errors.js");
const { issuesOf, ISSUE } = require("../core/outcomes.js");
const { sourceIssues } = require("../core/source-policy.js");
const { REQUIRED_FIELDS, OPTIONAL_FIELDS, readMetadata, readMetadataBatch, rawMetadata, finishMetadata,
    optionalValue, scalarValues, fieldAbsent, headerFailureCode } = require("../backend/metadata.js");
const { buildHeaderArgv, buildFieldArgv, headerGroups } = require("../backend/headers.js");
const { inspectSelection } = require("../application/inspection.js");
const { HEADER_ARGV_BUDGET, runHeaderArgv } = require("./shell.js");

function expectedHeaderFailure(caught) {
    const error = hostError(caught);
    const [issue] = issuesOf(error, "inspection");
    if (isUserCancelled(error) || issue.code === ISSUE.fault) { throw error; }
    return { error, issue };
}

function failedInspection(caught) {
    const { error, issue } = expectedHeaderFailure(caught);
    return { problem: issue.code === "damaged" ? "damaged" : headerFailureCode(errorMessage(error)),
        diagnostic: { ...issue.diagnostic, message: errorMessage(error), command: commandOf(error) } };
}

function pngFacts(sources, path, facts) {
    if (facts.format !== "PNG") { return facts; }
    try { return { ...facts, pages: sources.pngCount(path) }; }
    catch (error) { return { ...facts, ...failedInspection(error), problem: "damaged" }; }
}

function optionalField(app, tool, path, field) {
    try { return runHeaderArgv(app, buildFieldArgv(tool, field, [path]), "checking optional image metadata"); }
    catch (error) {
        if (fieldAbsent(errorMessage(error), field)) { return undefined; }
        throw error;
    }
}

function scalarFacts(app, tool, path) {
    const fields = {};
    for (const field of REQUIRED_FIELDS) {
        fields[field] = runHeaderArgv(app, buildFieldArgv(tool, field, [path]), "checking image metadata");
    }
    for (const field of OPTIONAL_FIELDS) {
        const value = optionalField(app, tool, path, field);
        if (value !== undefined) { fields[field] = value; }
    }
    return finishMetadata(rawMetadata(fields));
}

function parsedHeader(app, tool, path) {
    try {
        const text = runHeaderArgv(app, buildHeaderArgv(tool, [path]), "checking the image header");
        return readMetadata(text, path);
    } catch (error) {
        expectedHeaderFailure(error);
        return null;
    }
}

/** Optional fields in a printable dump may be forged by multiline comments. */
function confirmedOne(app, tool, path, parsed) {
    if (!parsed) { return scalarFacts(app, tool, path); }
    let { raw } = parsed;
    for (const field of parsed.optional) { raw = optionalValue(raw, field, optionalField(app, tool, path, field)); }
    return finishMetadata(raw);
}

function readOne(app, tools, sources, path) {
    try {
        return pngFacts(sources, path, confirmedOne(app, tools.vipsheader, path, parsedHeader(app, tools.vipsheader, path)));
    } catch (error) { return failedInspection(error); }
}

function confirmBatch(app, tool, paths, parsed) {
    const raw = parsed.map((entry) => entry.raw);
    for (const field of OPTIONAL_FIELDS) {
        const indices = parsed.flatMap((entry, index) => entry.optional.includes(field) ? [index] : []);
        if (indices.length > 0) {
            const text = runHeaderArgv(app, buildFieldArgv(tool, field, indices.map((index) => paths[index])), "checking optional image metadata");
            const values = scalarValues(text, indices.length);
            indices.forEach((index, position) => { raw[index] = optionalValue(raw[index], field, values[position]); });
        }
    }
    return raw.map(finishMetadata);
}

function inspectBatch(app, tools, sources, entries) {
    const paths = entries.map((entry) => entry.source.path);
    const text = runHeaderArgv(app, buildHeaderArgv(tools.vipsheader, paths), "checking image headers");
    const parsed = paths.length === 1 ? [readMetadata(text, paths[0])] : readMetadataBatch(text, paths);
    return confirmBatch(app, tools.vipsheader, paths, parsed).map((image, index) => pngFacts(sources, paths[index], image));
}

function batchesFor(tools, candidates) {
    const groups = headerGroups(tools.vipsheader, candidates.map((entry) => entry.source.path), HEADER_ARGV_BUDGET);
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
        accessed: (done, count) => progress.checking(done, count, "Checking image access"),
        checked: (done) => progress.checking(done, total),
        fileFacts: (entry) => ({ ...sources.facts(entry.path), readable: sources.readable(entry.path) }),
        batches: (candidates) => batchesFor(tools, candidates),
        inspect: (entries) => inspectBatch(app, tools, sources, entries),
        inspectOne: (entry) => readOne(app, tools, sources, entry.source.path)
    }, selection);
}

/** The owned copy is always re-inspected, independently of admission. */
function inspectCaptured(job, owned, original) {
    const facts = readOne(job.app, job.tools, job.sources, owned.path);
    const issues = sourceIssues(facts);
    if (issues.length > 0) {
        const issue = { ...issues[0], source: original };
        const error = new OperationError(`${original}: ${issue.message}`);
        error.issues = [issue];
        throw error;
    }
    return { ...owned, ...facts };
}
module.exports = { inspectCandidates, inspectCaptured };
