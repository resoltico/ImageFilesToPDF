"use strict";
const { isUserCancelled } = require("../core/errors.js");
const { ISSUE, issuesOf } = require("../core/outcomes.js");

const MAX_QUEUED_PAGES = 32;
const MAX_QUEUED_BYTES = 67108864;

function removePages(ports, pages) {
    const issues = [];
    for (const page of pages) {
        try { ports.remove(page.path); }
        catch (error) { issues.push(...issuesOf(error, "cleanup")); }
    }
    return issues;
}

function failedHandoff(ports, context, page, error) {
    context.record.issues.push(...removePages(ports, [page]));
    throw error;
}

/** A queue owns rendered pages until import succeeds; the partial PDF is disposable. */
function pageQueue(ports, context) {
    let pages = [];
    let bytes = 0;
    const clear = () => {
        const issues = removePages(ports, pages);
        pages = []; bytes = 0;
        if (issues.length > 0) { const error = new Error("Page cleanup failed."); error.issues = issues; throw error; }
    };
    const flush = () => {
        if (pages.length > 0) {
            context.stage = "import";
            ports.import(context.artifact.path, pages.map((page) => page.path));
            clear();
        }
    };
    return { clear, flush, add(page) {
        try {
            if (pages.length > 0 && (bytes + page.size > MAX_QUEUED_BYTES ||
                !ports.fits(context.artifact.path, [...pages, page].map((entry) => entry.path)))) { flush(); }
            pages.push(page);
            bytes += page.size;
        } catch (error) { failedHandoff(ports, context, page, error); }
        if (bytes >= MAX_QUEUED_BYTES || pages.length >= MAX_QUEUED_PAGES) { flush(); }
    } };
}

function prepareDocument(ports, plan, context, queue) {
    for (const [index, source] of plan.sources.entries()) {
        context.stage = "preparation";
        context.source = source.path;
        ports.beginning(source, index, context.documentIndex);
        const page = ports.prepare(source, index);
        context.record.pages += 1;
        queue.add(page);
        ports.prepared();
    }
}

function validateDocument(ports, plan, context) {
    context.stage = "validation";
    context.artifact.state = "validating";
    ports.validate(context.artifact.path, plan.sources.length);
    context.record.state = "validated";
    context.artifact.state = "validated";
}

function markFatal(record) {
    if (record.issues.some((issue) => [ISSUE.fault, ISSUE.cleanup].includes(issue.code))) { record.fatal = true; }
}

function finishDocument(ports, plan, context, queue) {
    queue.flush();
    validateDocument(ports, plan, context);
    context.stage = "publication";
    const saved = ports.publish(context.artifact.path, plan.destination);
    Object.assign(context.record, { state: "saved", output: saved.path });
    context.record.issues.push(...saved.issues);
    markFatal(context.record);
}

function resolveValidationFailure(context) {
    const { artifact, record } = context;
    if (artifact?.state === "validating") {
        if (record.issues.every((issue) => issue.code === ISSUE.operation || issue.code === ISSUE.cancelled)) {
            artifact.state = "building";
        } else {
            record.issues.push({ code: ISSUE.fault, stage: "validation", message: `Validation was not confirmed; the candidate PDF remains here:\n${artifact.path}` });
        }
    }
}


function documentFailure(context, error) {
    const { artifact, record, stage } = context;
    record.issues.push(...issuesOf(error, stage).map((issue) => stage === "preparation"
        ? { ...issue, source: issue.source ?? context.source } : issue));
    if (record.state === "validated") {
        Object.assign(record, { state: "recovered", recovery: error?.recovery ?? artifact.path });
    } else if (record.state !== "saved") {
        record.state = isUserCancelled(error) ? "cancelled" : "failed";
        resolveValidationFailure(context);
    }
    markFatal(record);
}

function observeCompletion(ports, record) {
    try { ports.completed(record); }
    catch (error) { record.diagnostics = issuesOf(error, "observer"); }
}

function discardDisposable(ports, context, queue) {
    try { queue.clear(); }
    catch (error) { context.record.issues.push(...issuesOf(error, "cleanup")); context.record.fatal = true; }
    if (context.artifact?.state === "building") {
        try { ports.remove(context.artifact.path); }
        catch (error) { context.record.issues.push(...issuesOf(error, "cleanup")); context.record.fatal = true; }
    }
}

function handleDocumentFailure(context, error) {
    try { documentFailure(context, error); }
    catch (failure) {
        context.record.issues.push(...issuesOf(failure, "failure-reporting"));
        context.record.fatal = true;
        if (context.record.state === "validated") {
            Object.assign(context.record, { state: "recovered", recovery: context.artifact.path });
        } else if (context.record.state !== "saved") { context.record.state = "failed"; }
    }
}

/** Ports own native values and bytes. This executor owns document/resource sequencing. */
function executeDocument(ports, plan, documentIndex) {
    const context = { documentIndex, artifact: null, stage: "allocation",
        record: { state: "building", sources: plan.sources.map((source) => source.path), pages: 0, issues: [] } };
    const queue = pageQueue(ports, context);
    try {
        context.artifact = ports.allocate(documentIndex);
        prepareDocument(ports, plan, context, queue);
        finishDocument(ports, plan, context, queue);
    } catch (error) {
        handleDocumentFailure(context, error);
    }
    finally { discardDisposable(ports, context, queue); }
    observeCompletion(ports, context.record);
    return context.record;
}

function executeDocuments(ports, plans, records = []) {
    let stopped = false;
    for (const [index, plan] of plans.entries()) {
        const record = stopped ? { state: "not-started", sources: plan.sources.map((source) => source.path), pages: 0, issues: [] }
            : executeDocument(ports, plan, index);
        records.push(record);
        stopped ||= record.state === "cancelled" || record.fatal || record.issues.some((issue) => issue.code === ISSUE.cancelled);
    }
    return records;
}
module.exports = { executeDocument, executeDocuments, MAX_QUEUED_PAGES, MAX_QUEUED_BYTES };
