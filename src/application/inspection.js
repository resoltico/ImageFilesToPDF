"use strict";
const { isUserCancelled } = require("../core/errors.js");
const { issuesOf, ISSUE } = require("../core/outcomes.js");
const { sourceIssue, sourceFileIssue, sourceIssues, sourceRefusal } = require("../core/source-policy.js");
const ACCESS_CHECK_INTERVAL = 32;

function expectedFailure(error) {
    if (isUserCancelled(error) || issuesOf(error, "inspection")[0].code === ISSUE.fault) { throw error; }
}

function fileCandidates(ports, images, rejected) {
    const candidates = [];
    for (const [index, source] of images.entries()) {
        if (index % ACCESS_CHECK_INTERVAL === 0) { ports.accessed(index, images.length); }
        try {
            const file = ports.fileFacts(source);
            const issue = sourceFileIssue(file);
            if (issue) { rejected.push(sourceRefusal(source.path, issue)); }
            else { candidates.push({ source, file }); }
        } catch (error) {
            expectedFailure(error);
            rejected.push(sourceRefusal(source.path, sourceIssue("unreadable", { unavailable: true }, { message: error.message })));
        }
    }
    return candidates;
}

function inspectBatch(ports, batch, completed) {
    try { return ports.inspect(batch); }
    catch (error) {
        expectedFailure(error);
        return batch.map((entry, index) => {
            ports.checked(completed + index);
            return ports.inspectOne(entry);
        });
    }
}

function include(checked, entry, image, rejected) {
    const issues = sourceIssues(image);
    if (issues.length > 0) { rejected.push(sourceRefusal(entry.source.path, issues[0])); }
    else {
        checked.push({ ...entry.source, admission: { identity: entry.file.identity, version: entry.file.version, image } });
    }
}

/** Content refusals are settled before consent. Capture inspection remains independent. */
function inspectSelection(ports, selection) {
    if (selection.images.length === 0) { return selection; }
    const rejected = [...selection.rejected];
    const images = [];
    ports.begin(selection.images.length);
    const candidates = fileCandidates(ports, selection.images, rejected);
    let completed = selection.images.length - candidates.length;
    ports.checked(completed);
    for (const batch of ports.batches(candidates)) {
        const facts = inspectBatch(ports, batch, completed);
        if (facts.length !== batch.length) { throw new Error("Image inspection did not account for every source."); }
        batch.forEach((entry, index) => include(images, entry, facts[index], rejected));
        completed += batch.length;
        ports.checked(completed);
    }
    return { ...selection, images, rejected };
}
module.exports = { inspectSelection };
