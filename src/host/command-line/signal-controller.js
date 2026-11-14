"use strict";
const { OperationError } = require("../../core/errors.js");
const { issuesOf } = require("../../core/outcomes.js");
const { nativeSignalActions } = require("./signal-actions.js");
const SIGINT = 2;
const SIGTERM = 15;
const SIGNALS = [SIGINT, SIGTERM];
const OPEN_SYSTEM_LIBRARY = 10;
const MILLISECONDS_PER_SECOND = 1000;
const MAXIMUM_CLOSE_MS = 1000;
const POLL_SECONDS = 0.001;

function bindSignalApis(objc) {
    try {
        objc.import("CoreFoundation"); objc.import("dispatch");
        for (const [name, types] of [
            ["dlopen", ["void *", ["string", "int"]]], ["dlsym", ["void *", ["void *", "string"]]],
            ["dlclose", ["int", ["void *"]]],
            ["dispatch_source_create", ["id", ["void *", "unsigned long", "unsigned long", "id"]]],
            ["dispatch_release", ["void", ["id"]]]
        ]) { objc.bindFunction(name, types); }
    } catch (cause) {
        if (cause instanceof TypeError || cause instanceof ReferenceError) { throw cause; }
        throw new OperationError("Command-line signal monitoring is unavailable.", { cause });
    }
}

function signalSourceType(ns, ref, library, nilPointer) {
    try {
        const type = ns.dlsym(library, "_dispatch_source_type_signal");
        if (ref.equals(type, nilPointer)) { throw new OperationError("The system signal dispatch source is unavailable."); }
        return type;
    } catch (error) {
        let cleanupFailure = null;
        try {
            if (ns.dlclose(library) !== 0) { cleanupFailure = new OperationError("The system signal library could not be closed."); }
        } catch (failure) { cleanupFailure = failure; }
        if (cleanupFailure) {
            throw new OperationError(error.message, { cause: error, issues: [...issuesOf(error, "setup"), ...issuesOf(cleanupFailure, "cleanup")] });
        }
        throw error;
    }
}

function nativeSignalAccess(objc = globalThis.ObjC, ns = globalThis.$, ref = globalThis.Ref) {
    if (!objc || !ns || !ref) { throw new OperationError("Command-line signal monitoring requires the Objective-C bridge."); }
    const actions = nativeSignalActions(objc, ns, ref);
    bindSignalApis(objc);
    const nilPointer = ns.NSValue.valueWithPointer(null).pointerValue;
    const queue = ns.NSOperationQueue.mainQueue.underlyingQueue;
    if (!queue || queue.isNil()) { throw new OperationError("The JavaScript main dispatch queue is unavailable."); }
    const library = ns.dlopen("/usr/lib/libSystem.B.dylib", OPEN_SYSTEM_LIBRARY);
    if (ref.equals(library, nilPointer)) { throw new OperationError("The system signal library could not be opened."); }
    const type = signalSourceType(ns, ref, library, nilPointer);
    return {
        ...actions,
        now: () => ns.NSProcessInfo.processInfo.systemUptime * MILLISECONDS_PER_SECOND,
        create: (number) => { const source = ns.dispatch_source_create(type, number, 0, queue); return source && !source.isNil() ? source : null; },
        block: (callback) => objc.block(["void", []], callback),
        handlers(source, event, cancel) { ns.dispatch_source_set_cancel_handler(source, cancel); ns.dispatch_source_set_event_handler(source, event); },
        activate: (source) => ns.dispatch_resume(source), cancel: (source) => ns.dispatch_source_cancel(source),
        release: (source) => ns.dispatch_release(source),
        pump: () => ns.CFRunLoopRunInMode(ns.kCFRunLoopDefaultMode, POLL_SECONDS, false),
        closeLibrary: () => ns.dlclose(library)
    };
}

function restoreAndReleaseSignal(access, state, attempt) {
    if (state.snapshot) {
        if (state.changed) { attempt(() => {
            if (access.restore(state.number, state.snapshot) !== 0) { throw new OperationError("A previous signal disposition could not be restored."); }
            state.changed = false;
        }); }
        if (!state.changed) { attempt(() => { access.free(state.snapshot); state.snapshot = null; }); }
    }
    if (state.source && state.retired) {
        attempt(() => { access.release(state.source); state.source = null; state.event = null; state.cancel = null; });
    }
}

function installSignal(access, state, onEvent) {
    state.snapshot = access.allocate();
    if (!state.snapshot) { throw new OperationError("Storage for a signal disposition could not be allocated."); }
    if (access.read(state.number, state.snapshot) !== 0) { throw new OperationError("A previous signal disposition could not be read."); }
    state.source = access.create(state.number);
    if (!state.source) { throw new OperationError("A signal dispatch source could not be created."); }
    // Native callbacks only latch state on the JavaScript main queue.
    state.event = access.block(onEvent);
    state.cancel = access.block(() => { state.retired = true; });
    access.handlers(state.source, state.event, state.cancel);
    state.changed = true;
    if (access.ignore(state.number) !== 0) { throw new OperationError("A signal could not be deferred to its cooperative checkpoint."); }
    access.activate(state.source);
    state.active = true;
}

function createSignalController(access = nativeSignalAccess()) {
    const states = [];
    let requested = false;
    let closing = false;
    let libraryClosed = false;
    const onEvent = () => { if (!closing) { requested = true; } };
    function cleanup() {
        closing = true;
        const failures = [];
        function attempt(action) { try { action(); } catch (error) { failures.push(error); } }
        for (const state of states) {
            if (state.source && !state.canceled) {
                attempt(() => { access.cancel(state.source); state.canceled = true; });
                // A suspended source must be resumed for its cancellation handler to retire.
                if (!state.active) { attempt(() => { access.activate(state.source); state.active = true; }); }
            }
        }
        const deadline = access.now() + MAXIMUM_CLOSE_MS;
        while (states.some((state) => state.source && !state.retired) && access.now() < deadline) {
            try { access.pump(); } catch (error) { failures.push(error); break; }
        }
        for (const state of states) { restoreAndReleaseSignal(access, state, attempt); }
        // A created source has a +1 native retain. Installed handlers are copied
        // blocks; the cancel block retains its JS state closure. Without retirement
        // acknowledgement, keep that native source and its callback state alive
        // until the CLI process exits rather than free memory C could still use.
        const pending = states.some((state) => state.source || state.snapshot);
        if (pending) { failures.push(new OperationError("Signal monitoring did not finish closing; its callback references were retained for safety.")); }
        if (!pending && !libraryClosed) { attempt(() => {
            if (access.closeLibrary() !== 0) { throw new OperationError("The system signal library could not be closed."); }
            libraryClosed = true;
        }); }
        return failures;
    }
    function close() {
        if (libraryClosed) { return; }
        const failures = cleanup();
        if (failures.length > 0) { throw new OperationError("Command-line signal monitoring could not be completely closed.", { cause: failures[0], issues: failures.flatMap((error) => issuesOf(error, "cleanup")) }); }
    }
    try {
        for (const number of SIGNALS) {
            const state = { number, snapshot: null, source: null, changed: false, active: false, canceled: false, retired: false, event: null, cancel: null };
            states.push(state);
            installSignal(access, state, onEvent);
        }
    } catch (error) {
        const failures = cleanup();
        if (failures.length > 0) { throw new OperationError(error.message, { cause: error, issues: [...issuesOf(error, "setup"), ...failures.flatMap((failure) => issuesOf(failure, "cleanup"))] }); }
        throw error;
    }
    return { poll() { if (!closing) { access.pump(); } return requested; }, close };
}
module.exports = { createSignalController };
