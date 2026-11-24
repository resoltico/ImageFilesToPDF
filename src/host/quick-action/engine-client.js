"use strict";
const { VERSION } = require("../../core/version.js");
const { OperationError, isUserCanceled } = require("../../core/errors.js");
const { issueMessage, message } = require("../../core/messages.js");
const { validateMessage } = require("../../core/protocol.js");
const { startChild } = require("./engine-child.js");
const { materializeEngine } = require("./engine-cache.js");

const { NODE_EXECUTABLES } = require("../backend-executables.js");
const MINIMUM_NODE_MAJOR = 26;

function findNode(paths, launch) {
    ObjC.import("Foundation");
    const manager = $.NSFileManager.defaultManager;
    for (const executable of paths.filter((path) => manager.isExecutableFileAtPath(path))) {
        const child = launch(executable, ["--version"]);
        try {
            child.finishInput();
            let version = "";
            while (!child.closed()) { version += child.tick(); }
            const match = /^v(?<major>\d+)\.\d+\.\d+$/u.exec(version.trim());
            if (child.result().status === 0 && match && Number(match.groups.major) >= MINIMUM_NODE_MAJOR) { return executable; }
        } finally { child.close(); }
    }
    const issue = issueMessage("runtime-unavailable", "setup", "runtimeUnavailable", { major: MINIMUM_NODE_MAJOR });
    throw new OperationError(issue.message, { issues: [issue] });
}

function wire(child, pulse) {
    let buffered = "";
    return {
        send(event) { child.send(`${JSON.stringify(validateMessage("client", event))}\n`); },
        receive() {
            let newline = buffered.indexOf("\n");
            while (newline === -1 && !child.closed()) {
                buffered += child.tick();
                pulse();
                newline = buffered.indexOf("\n");
            }
            if (newline === -1) { return null; }
            const event = validateMessage("engine", JSON.parse(buffered.slice(0, newline)));
            buffered = buffered.slice(newline + 1);
            return event;
        }
    };
}

function answer(event, hooks, messages) {
    if (event.type === "review") {
        try { hooks.review(event.context); }
        catch (error) {
            if (!isUserCanceled(error)) { throw error; }
            messages.send({ type: "cancel" });
            return;
        }
        messages.send({ type: "continue" });
    } else if (event.type === "settings-needed" || event.type === "settings-invalid") {
        try {
            messages.send({ type: "settings", values: hooks.settings(event.context, event.issues) });
        } catch (error) {
            if (!isUserCanceled(error)) { throw error; }
            messages.send({ type: "stop" });
        }
    } else { hooks.progress(event); }
}

function complete(child, messages, items, hooks) {
    const hello = messages.receive();
    if (hello?.type !== "hello" || hello.version !== VERSION) { throw new OperationError(message("engineVersionMismatch")); }
    messages.send({ type: "start", inputItems: items });
    let event = messages.receive();
    while (event && event.type !== "outcome") {
        answer(event, hooks, messages);
        event = messages.receive();
    }
    child.finishInput();
    while (!child.closed()) { child.tick(); }
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
    let stopSent = false;
    const messages = wire(child, () => {
        if (!stopSent && hooks.stopped()) {
            stopSent = true;
            messages.send({ type: "stop" });
        }
    });
    try { return complete(child, messages, items, hooks); }
    finally { child.close(); }
}

module.exports = { engineSession };
