"use strict";
const { VERSION, MINIMUM_NODE_VERSION, supportsNode } = require("../../core/version.js");
const { OperationError, isUserCanceled } = require("../../core/errors.js");
const { issueMessage, message } = require("../../core/messages.js");
const { encodeMessage, decodeMessage, requireHello } = require("../../core/protocol.js");
const { startChild } = require("./engine-child.js");
const { materializeEngine } = require("./engine-cache.js");

const { NODE_EXECUTABLES } = require("../node-executables.js");

function findNode(paths, launch) {
    ObjC.import("Foundation");
    const manager = $.NSFileManager.defaultManager;
    for (const executable of paths.filter((path) => manager.isExecutableFileAtPath(path))) {
        const child = launch(executable, ["--version"]);
        try {
            child.finishInput();
            let version = "";
            while (!child.closed()) { version += child.tick(); }
            if (child.result().status === 0 && supportsNode(version.trim())) { return executable; }
        } finally { child.close(); }
    }
    const issue = issueMessage("runtime-unavailable", "setup", "runtimeUnavailable", { minimum: MINIMUM_NODE_VERSION });
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
                if (buffered.length > 0) { throw new OperationError(message("engineMessageIncomplete")); }
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

function complete(child, messages, items, state) {
    requireHello(messages.receive(), VERSION);
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
    const { status, diagnostic } = child.result();
    if (status !== 0 || event?.type !== "outcome") {
        throw new OperationError(message("engineSessionFailed"), { diagnostic: { message: diagnostic, status } });
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
