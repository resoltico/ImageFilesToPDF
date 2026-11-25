"use strict";
const { message, issueMessage, issueMessages } = require("../core/messages.js");
const { IssueError, isUserCanceled } = require("../core/errors.js");
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
        if (issues.length > 0) { const error = new IssueError(message("pageCleanupFailed"), { issues }); throw error; }
    };
    const flush = async () => {
        if (pages.length > 0) {
            context.stage = "import";
            const paths = pages.map((page) => page.path);
            if (!ports.fits(context.artifact.path, paths, pages[0].placement)) {
                throw new IssueError(message("pdfImportArgumentBudgetExceeded"));
            }
            await ports.import(context.artifact.path, paths, pages[0].placement);
            clear();
        }
    };
    return { clear, flush, async add(page) {
        try {
            if (pages.length > 0 && (pages[0].group !== page.group || bytes + page.size > MAX_QUEUED_BYTES ||
                !ports.fits(context.artifact.path, [...pages, page].map((entry) => entry.path), page.placement))) { await flush(); }
            pages.push(page);
            bytes += page.size;
        } catch (error) { failedHandoff(ports, context, page, error); }
        if (bytes >= MAX_QUEUED_BYTES || pages.length >= MAX_QUEUED_PAGES) { await flush(); }
    } };
}

function closePreparations(slots) {
    const issues = [];
    for (const slot of slots) {
        try { slot?.close(); }
        catch (error) {
            issues.push(...issuesOf(error, "cleanup").map((issue) => ({ ...issue, code: ISSUE.cleanup })));
        }
    }
    return issues;
}

async function prepareGroup(ports, context, queue, group) {
    const { record } = context;
    const slots = [];
    ports.capturing();
    const results = await Promise.allSettled(group.map(async ([index, source], offset) => {
        const slot = ports.capture(source, index);
        slots[offset] = slot;
        return await slot.ready;
    }));
    let failure = null;
    try {
        for (const [offset, outcome] of results.entries()) {
            const [index, source] = group[offset];
            Object.assign(context, { stage: "preparation", source: source.path });
            if (outcome.status === "rejected") { throw outcome.reason; }
            ports.beginning(source, index, context.documentIndex);
            const page = await ports.prepare(source, index, slots[offset], outcome.value);
            record.pages += 1;
            await queue.add(page);
            ports.prepared();
        }
    } catch (error) { failure = { error }; }
    const issues = closePreparations(slots);
    if (failure) {
        record.issues.push(...issues);
        throw failure.error;
    }
    if (issues.length > 0) { throw new IssueError(issueMessages(issues), { issues }); }
}

async function prepareDocument(ports, plan, context, queue) {
    for (let offset = 0; offset < plan.sources.length; offset += ports.parallelism) {
        const group = plan.sources.slice(offset, offset + ports.parallelism).map((source, index) => [offset + index, source]);
        await prepareGroup(ports, context, queue, group);
    }
}

async function validateDocument(ports, plan, context) {
    context.stage = "validation";
    const { artifact, record } = context;
    ports.beforeValidation(artifact.path);
    artifact.state = "validating";
    await ports.validate(artifact.path, plan.sources.length);
    record.state = "validated";
    artifact.state = "validated";
}

function markFatal(record) {
    if (record.issues.some((issue) => [ISSUE.fault, ISSUE.cleanup].includes(issue.code))) { record.fatal = true; }
}

async function finishDocument(ports, plan, context, queue) {
    await queue.flush();
    context.stage = "assembly";
    await ports.assemble(context.artifact.path);
    await validateDocument(ports, plan, context);
    Object.assign(context, { stage: "publication" });
    const saved = await ports.publish(context.artifact.path, plan.destination);
    Object.assign(context.record, { state: "saved", output: saved.path });
    context.record.issues.push(...saved.issues);
    markFatal(context.record);
}

function resolveValidationFailure(context) {
    const { artifact, record } = context;
    if (artifact?.state === "validating") {
        if (record.issues.every((issue) => issue.code === ISSUE.operation || issue.code === ISSUE.canceled)) {
            artifact.state = "building";
        } else {
            record.issues.push(issueMessage(ISSUE.fault, "validation", "validationUnconfirmed", { path: artifact.path }));
        }
    }
}

function documentFailure(context, error) {
    const { artifact, record, stage } = context;
    record.issues.push(...issuesOf(error, stage).map((issue) => stage === "preparation"
        ? { ...issue, source: issue.source ?? context.source } : issue));
    if (record.state === "validated") {
        if (error && Object.hasOwn(error, "recovery") && error.recovery === null) { record.state = "failed"; record.fatal = true; }
        else { Object.assign(record, { state: "recovered", recovery: error?.recovery ?? artifact.path }); }
    } else if (record.state !== "saved") {
        record.state = isUserCanceled(error) ? "canceled" : "failed";
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
async function executeDocument(ports, plan, documentIndex) {
    // The record gains its state when the document settles, before anyone reads it.
    const context = { documentIndex, artifact: null, stage: "allocation",
        record: { sources: plan.sources.map((source) => source.path), pages: 0, issues: [] } };
    const queue = pageQueue(ports, context);
    try {
        context.artifact = ports.allocate(documentIndex);
        await prepareDocument(ports, plan, context, queue);
        await finishDocument(ports, plan, context, queue);
    } catch (error) {
        handleDocumentFailure(context, error);
    }
    finally { discardDisposable(ports, context, queue); }
    observeCompletion(ports, context.record);
    return context.record;
}

async function executeDocuments(ports, plans, records = []) {
    let stopped = false;
    for (const [index, plan] of plans.entries()) {
        const record = stopped ? { state: "not-started", sources: plan.sources.map((source) => source.path), pages: 0, issues: [] }
            : await executeDocument(ports, plan, index);
        records.push(record);
        stopped ||= record.state === "canceled" || record.fatal || record.issues.some((issue) => issue.code === ISSUE.canceled);
    }
    return records;
}
module.exports = { executeDocuments };
