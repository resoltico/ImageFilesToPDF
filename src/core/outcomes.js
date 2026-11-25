"use strict";
const { OperationError, errorMessage, commandOf, isUserCanceled } = require("./errors.js");

/** @typedef {{state:"saved"|"recovered"|"failed"|"canceled"|"not-started", sources:string[], pages:number, issues:Object[], output?:string, recovery?:string, fatal?:boolean, diagnostics?:Object[]}} DocumentOutcome */
const { issueMessage } = require("./messages.js");
const ISSUE = Object.freeze({ operation: "operation", fault: "fault", canceled: "canceled",
    cleanup: "cleanup", publication: "publication", recovery: "recovery" });
const RUN_OUTCOME = Object.freeze({ complete: "complete", incomplete: "incomplete", canceled: "canceled",
    invalidRequest: "invalid-request", setupFailed: "setup-failed" });

function errorCode(error) {
    if (isUserCanceled(error)) { return ISSUE.canceled; }
    if (error?.cause instanceof TypeError || error?.cause instanceof ReferenceError) { return ISSUE.fault; }
    return error instanceof OperationError ? ISSUE.operation : ISSUE.fault;
}

function readableIssues(error, stage) {
    const issues = error?.issues;
    if (Array.isArray(issues) && issues.length > 0 && issues.every((issue) => issue && typeof issue.code === "string")) { return issues; }
    return [{ code: issues === undefined ? errorCode(error) : ISSUE.fault, stage, params: error?.params ?? {}, message: errorMessage(error),
        diagnostic: { ...error?.diagnostic, command: commandOf(error), stack: error?.stack ?? "" } }];
}

function issuesOf(error, stage) {
    try { return readableIssues(error, stage); }
    catch { return [issueMessage(ISSUE.fault, stage, "failureDetailsUnreadable")]; }
}

/** A failure's issues for their codes, messages and diagnostics, where the caller reports no stage. */
function failureIssues(error) {
    return issuesOf(error, undefined);
}

/** Saved paths/source mappings are authoritative; rendered-page counts never imply publication. */
function runOutcome(documents = [], rejected = [], issues = [], diagnostics = []) {
    const undone = documents.some((document) => document.state !== "saved");
    const stopped = issues.some((issue) => issue.code === ISSUE.canceled) || documents.some((document) => document.state === "canceled" || document.issues.some((issue) => issue.code === ISSUE.canceled));
    let state = RUN_OUTCOME.complete;
    if (undone || documents.some((document) => document.issues.length > 0) || rejected.length > 0 || issues.length > 0 || documents.length === 0) { state = RUN_OUTCOME.incomplete; }
    if (stopped && (undone || documents.length === 0)) { state = RUN_OUTCOME.canceled; }
    if (documents.length === 0) {
        if (issues.some((issue) => ["settings", "request"].includes(issue.stage))) { state = RUN_OUTCOME.invalidRequest; }
        else if (!stopped && issues.some((issue) => issue.stage === "setup")) { state = RUN_OUTCOME.setupFailed; }
    }
    return { state, documents, rejected, issues, diagnostics };
}
function noImagesOutcome(rejected) {
    return runOutcome([], rejected, [issueMessage("no-images", "selection", "noImagesAdmitted")]);
}

function failedRun(error, outcome = null) {
    if (outcome && isUserCanceled(error)) { return outcome; }
    return runOutcome(outcome?.documents ?? [], outcome?.rejected ?? [],
        [...(outcome?.issues ?? []), ...issuesOf(error, outcome ? "reporting" : "setup")], outcome?.diagnostics ?? []);
}

module.exports = { failureIssues, ISSUE, RUN_OUTCOME, issuesOf, runOutcome, noImagesOutcome, failedRun };
