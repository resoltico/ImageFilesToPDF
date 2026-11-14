"use strict";
const { OperationError, errorMessage, commandOf, isUserCanceled } = require("./errors.js");

/** @typedef {{state:"saved"|"recovered"|"failed"|"canceled"|"not-started", sources:string[], pages:number, issues:Object[], output?:string, recovery?:string, fatal?:boolean, diagnostics?:Object[]}} DocumentOutcome */
const ISSUE = Object.freeze({ operation: "operation", fault: "fault", canceled: "canceled",
    cleanup: "cleanup", publication: "publication", recovery: "recovery" });

function errorCode(error) {
    if (isUserCanceled(error)) { return ISSUE.canceled; }
    if (error?.cause instanceof TypeError || error?.cause instanceof ReferenceError) { return ISSUE.fault; }
    return error instanceof OperationError ? ISSUE.operation : ISSUE.fault;
}

function readableIssues(error, stage) {
    const issues = error?.issues;
    if (Array.isArray(issues) && issues.length > 0 && issues.every((issue) => issue && typeof issue.code === "string")) { return issues; }
    return [{ code: issues === undefined ? errorCode(error) : ISSUE.fault, stage, message: errorMessage(error),
        diagnostic: { command: commandOf(error), stack: error?.stack ?? "" } }];
}

function issuesOf(error, stage) {
    try { return readableIssues(error, stage); }
    catch { return [{ code: ISSUE.fault, stage, message: "The failure details could not be read." }]; }
}

function isSetupRefusal(issue) { return issue.stage === "setup" && issue.code === ISSUE.operation; }

/** Saved paths/source mappings are authoritative; rendered-page counts never imply publication. */
function runOutcome(documents = [], rejected = [], issues = [], diagnostics = []) {
    const undone = documents.some((document) => document.state !== "saved");
    const stopped = issues.some((issue) => issue.code === ISSUE.canceled) || documents.some((document) => document.state === "canceled" || document.issues.some((issue) => issue.code === ISSUE.canceled));
    let state = "complete";
    if (undone || documents.some((document) => document.issues.length > 0) || rejected.length > 0 || issues.length > 0 || documents.length === 0) { state = "incomplete"; }
    if (stopped && (undone || documents.length === 0)) { state = "canceled"; }
    if (documents.length === 0 && issues.some((issue) => ["settings", "request"].includes(issue.stage) || (!stopped && isSetupRefusal(issue)))) { state = "invalid"; }
    return { state, documents, rejected, issues, diagnostics };
}
function noImagesOutcome(rejected) {
    return runOutcome([], rejected, [{ code: "no-images", stage: "selection", message: "None of the selected items can be converted." }]);
}

function failedRun(error, outcome = null) {
    if (outcome && isUserCanceled(error)) { return outcome; }
    return runOutcome(outcome?.documents ?? [], outcome?.rejected ?? [],
        [...(outcome?.issues ?? []), ...issuesOf(error, outcome ? "reporting" : "setup")], outcome?.diagnostics ?? []);
}

module.exports = { ISSUE, issuesOf, runOutcome, noImagesOutcome, failedRun, isSetupRefusal };
