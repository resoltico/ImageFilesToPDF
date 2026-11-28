"use strict";
const { VERSION } = require("../../core/product.js");
const { supportsNode, runtimeUnavailableIssue } = require("../../core/runtime.js");
const { OperationError, isUserCanceled } = require("../../core/errors.js");
const { message } = require("../../core/messages.js");
const { encodeMessage, decodeMessage, requireHello } = require("../../core/protocol.js");
const { startChild } = require("./engine-child.js");
const { materializeEngine } = require("./engine-cache.js");
const { finderDirectories } = require("./executable-search.js");
const { absoluteMacPath, TOOL_NAMES } = require("../../core/executable-search.js");
const { chosenExecutableIssue } = require("../../core/setup.js");

function versionChild(executable, launch) {
    try { return launch(executable, ["--version"]); }
    catch (error) {
        if (error instanceof OperationError) { return null; }
        throw error;
    }
}

function findNode(directories, chosen, launch) {
    ObjC.import("Foundation");
    const manager = $.NSFileManager.defaultManager;
    const paths = chosen === undefined ? directories.map((directory) => `${directory}/node`) : [chosen];
    const found = [];
    for (const executable of paths.filter((path) => absoluteMacPath(path) && manager.isExecutableFileAtPath(path))) {
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
    const issues = chosen === undefined ? [issue] : [chosenExecutableIssue("node", chosen), issue];
    throw new OperationError(issue.message, { issues });
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

function complete(child, messages, request, state) {
    const hello = messages.receive();
    if (!hello) { throw sessionFailure(child); }
    requireHello(hello, VERSION);
    messages.send(request);
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

// launch and materialize are the native child and engine file; tests pass stand-ins.
function engineSession(bundle, items, hooks, { directories = finderDirectories(), chosen = {}, home, launch = startChild, materialize = materializeEngine } = {}) {
    const executable = findNode(directories, chosen.node, launch);
    const toolPaths = Object.fromEntries(TOOL_NAMES.filter((name) => Object.hasOwn(chosen, name)).map((name) => [name, chosen[name]]));
    const request = { type: "start", inputItems: items, toolPaths };
    const file = materialize(bundle, home ?? String(ObjC.unwrap($.NSHomeDirectory())));
    const child = launch(executable, [file, "--serve"]);
    // reviewed, requestedSettings and stopping: each unset until it happens.
    const session = {};
    const messages = wire(child, () => {
        if (!session.stopping && hooks.stopped()) {
            session.stopping = true;
            messages.send({ type: "stop" });
        }
    });
    try { return complete(child, messages, request, { hooks, session }); }
    finally { child.close(); }
}

module.exports = { engineSession };
