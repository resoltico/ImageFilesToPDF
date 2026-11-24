"use strict";
const { VERSION, supportsNode, runtimeUnavailableIssue } = require("../../core/version.js");
const { OperationError, isUserCanceled } = require("../../core/errors.js");
const { message } = require("../../core/messages.js");
const { encodeMessage, decodeMessage, requireHello } = require("../../core/protocol.js");
const { startChild } = require("./engine-child.js");
const { materializeEngine } = require("./engine-cache.js");

const { NODE_EXECUTABLES } = require("../node-executables.js");

function versionChild(executable, launch) {
    try { return launch(executable, ["--version"]); }
    catch (error) {
        if (error instanceof OperationError) { return null; }
        throw error;
    }
}

function findNode(paths, launch) {
    ObjC.import("Foundation");
    const manager = $.NSFileManager.defaultManager;
    const found = [];
    for (const executable of paths.filter((path) => manager.isExecutableFileAtPath(path))) {
        const candidate = { path: executable };
        found.push(candidate);
        const child = versionChild(executable, launch);
        if (child) {
            try {
                child.finishInput();
                let output = "";
                while (!child.closed()) { output += child.tick(); }
                const version = output.trim().replace(/^v/u, "");
                if (/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(version)) { candidate.version = version; }
                if (child.result().status === 0 && supportsNode(version)) { return executable; }
            } finally { child.close(); }
        }
    }
    const issue = runtimeUnavailableIssue(found);
    throw new OperationError(issue.message, { issues: [issue] });
}

function wire(child, pulse) {
    let buffered = "";
    return {
        send(event) { child.send(encodeMessage("client", event)); },
        receive() {
            let newline = buffered.indexOf("\n");
            while (newline === -1 && !child.closed()) {
                buffered += child.tick();
                pulse();
                newline = buffered.indexOf("\n");
            }
            if (newline === -1) {
                if (buffered.length > 0 && !child.inputBroken() && child.result().status === 0) { throw new OperationError(message("engineMessageIncomplete")); }
                return null;
            }
            const event = decodeMessage("engine", buffered.slice(0, newline));
            buffered = buffered.slice(newline + 1);
            return event;
        }
    };
}

function reply(hooks, event) {
    try {
        if (event.type === "review") { hooks.review(event.context); return { type: "continue" }; }
        return { type: "settings", values: hooks.settings(event.context, event.issues) };
    } catch (error) {
        if (!isUserCanceled(error)) { throw error; }
        return { type: event.type === "review" ? "cancel" : "stop" };
    }
}

function routeEvent(event, hooks, session, messages) {
    if (event.type === "phase" || event.type === "progress") { hooks.progress(event); return; }
    const canReview = event.type === "review" && !session.reviewed && !session.requestedSettings;
    const canAsk = event.type === "settings-needed" && !session.requestedSettings;
    const canRetry = event.type === "settings-invalid" && session.requestedSettings;
    if (!canReview && !canAsk && !canRetry) { throw new OperationError(message("engineMessageOrder")); }
    if (session.stopping) { return; }
    session.reviewed ||= canReview;
    session.requestedSettings ||= canAsk;
    const response = reply(hooks, event);
    session.stopping = response.type === "cancel" || response.type === "stop";
    messages.send(response);
}

function sessionFailure(child, outcome = undefined) {
    const { status, diagnostic } = child.result();
    return new OperationError(message("engineSessionFailed"), { diagnostic: { message: diagnostic, status }, outcome });
}

function complete(child, messages, items, state) {
    const hello = messages.receive();
    if (!hello) { throw sessionFailure(child); }
    requireHello(hello, VERSION);
    messages.send({ type: "start", inputItems: items });
    const { hooks, session } = state;
    let event = messages.receive();
    while (event && event.type !== "outcome") {
        routeEvent(event, hooks, session, messages);
        event = messages.receive();
    }
    session.stopping = true;
    child.finishInput();
    if (messages.receive()) { throw new OperationError(message("engineMessageOrder")); }
    if (child.inputBroken() || child.result().status !== 0 || event?.type !== "outcome") {
        throw sessionFailure(child, event?.receipt);
    }
    return event.receipt;
}

function engineSession(bundle, items, hooks, { paths = NODE_EXECUTABLES, home } = {}) {
    const executable = findNode(paths, startChild);
    const file = materializeEngine(bundle, home ?? String(ObjC.unwrap($.NSHomeDirectory())));
    const child = startChild(executable, [file, "--serve"]);
    const session = { reviewed: false, requestedSettings: false, stopping: false };
    const messages = wire(child, () => {
        if (!session.stopping && hooks.stopped()) {
            session.stopping = true;
            messages.send({ type: "stop" });
        }
    });
    try { return complete(child, messages, items, { hooks, session }); }
    finally { child.close(); }
}

module.exports = { engineSession };
