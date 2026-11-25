"use strict";
const { OperationError } = require("../../core/errors.js");
const { message } = require("../../core/messages.js");

const POLL_SECONDS = 0.05;
const SIGPIPE = 13;
const SIG_IGN = 1;

function watchPipe(ns, handle) {
    const { defaultCenter: center } = ns.NSNotificationCenter;
    const { data } = ns.NSMutableData;
    let pending = false;
    let ended = false;
    const lifetime = { callback: ObjC.block(["void", ["id"]], () => { pending = true; }) };
    const token = center.addObserverForNameObjectQueueUsingBlock(ns.NSFileHandleDataAvailableNotification, handle, ns(), lifetime.callback);
    // eslint-disable-next-line no-unused-expressions -- Native zero-argument selector.
    handle.waitForDataInBackgroundAndNotify;
    return {
        take() {
            if (!pending) { return ""; }
            pending = false;
            const bytes = handle.availableData;
            ended = Number(bytes.length) === 0;
            if (!ended) {
                data.appendData(bytes);
                // eslint-disable-next-line no-unused-expressions -- Rearm the one-shot native notification.
                handle.waitForDataInBackgroundAndNotify;
            }
            const value = ns.NSString.alloc.initWithDataEncoding(data, ns.NSUTF8StringEncoding);
            if (!value || value.isNil()) {
                if (ended) { throw new OperationError(message("engineInvalidUtf8")); }
                return "";
            }
            data.setLength(0);
            return String(ObjC.unwrap(value));
        },
        ended: () => ended,
        close() { center.removeObserver(token); lifetime.callback = null; }
    };
}

function taskFor(ns, executable, args) {
    const task = ns.NSTask.alloc.init;
    task.executableURL = ns.NSURL.fileURLWithPath(executable);
    task.arguments = ns(args);
    task.standardInput = ns.NSPipe.pipe;
    task.standardOutput = ns.NSPipe.pipe;
    task.standardError = ns.NSPipe.pipe;
    const environment = ns.NSProcessInfo.processInfo.environment.mutableCopy;
    environment.setObjectForKey(ns("C"), ns("LC_ALL"));
    task.environment = environment;
    return task;
}

function startChild(executable, args) {
    ObjC.import("Foundation");
    const ns = $;
    ObjC.bindFunction("signal", ["long", ["int", "long"]]);
    const task = taskFor(ns, executable, args);
    if (!task.launchAndReturnError(ns())) { throw new OperationError(message("engineLaunchFailed")); }
    const input = task.standardInput.fileHandleForWriting;
    const output = watchPipe(ns, task.standardOutput.fileHandleForReading);
    const errors = watchPipe(ns, task.standardError.fileHandleForReading);
    const previous = ns.signal(SIGPIPE, SIG_IGN);
    let diagnostic = "";
    let inputClosed = false;
    let broken = false;
    function finishInput() {
        if (!inputClosed) {
            inputClosed = true;
            try {
                // eslint-disable-next-line no-unused-expressions -- Node observes Stop on stdin EOF.
                input.closeFile;
            } catch { broken = true; }
        }
    }
    function tick() {
        ns.NSRunLoop.currentRunLoop.runUntilDate(ns.NSDate.dateWithTimeIntervalSinceNow(POLL_SECONDS));
        diagnostic += errors.take();
        return output.take();
    }
    return {
        send(text) {
            if (inputClosed || broken) { return; }
            try { input.writeData(ns(text).dataUsingEncoding(ns.NSUTF8StringEncoding)); }
            catch { broken = true; }
        },
        inputBroken: () => broken,
        finishInput, tick,
        closed: () => output.ended() && errors.ended() && !task.running,
        result: () => ({ status: Number(task.terminationStatus), diagnostic }),
        close() {
            try {
                finishInput();
                while (task.running) { tick(); }
            } finally {
                try { output.close(); }
                finally {
                    try { errors.close(); }
                    finally { ns.signal(SIGPIPE, previous); }
                }
            }
        }
    };
}

module.exports = { startChild };
