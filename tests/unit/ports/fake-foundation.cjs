"use strict";

/*
 * A stand-in for the Foundation calls the Finder action makes through the JXA
 * bridge: the file manager, strings and data, the user's identity, the C
 * functions it binds, and child processes with pipes.
 *
 * Like fake-objc.cjs it records rather than performs, and it implements only
 * what the Finder modules reach for. Zero-argument methods are getters, as in
 * JXA. A child process is a script: chunks of standard output and standard
 * error delivered one per run-loop turn, an exit status, and what it does with
 * standard input.
 *
 * Reading a pipe blocks until data or end of file arrives, so the fake refuses
 * a read that no notification announced; and it records a pipe re-armed after
 * its end, which the real one would announce forever.
 */

const { Buffer } = require("node:buffer");
const { TextDecoder } = require("node:util");

const NIL = Object.freeze({ isNil: () => true });
let active = null;

function wrapped(js) {
    return { js, isNil: () => false };
}

function dataOf(bytes) {
    const data = {
        bytes: Buffer.from(bytes),
        isNil: () => false,
        get length() { return data.bytes.length; },
        isEqualToData: (other) => Buffer.compare(data.bytes, other.bytes) === 0,
        appendData(other) { data.bytes = Buffer.concat([data.bytes, other.bytes]); },
        setLength(size) { data.bytes = data.bytes.subarray(0, size); },
        writeToFileOptionsError(path, options) {
            active.writes.push(path);
            if (active.writeFails || (options === 2 && active.files.has(path))) { return false; }
            active.files.set(path, { content: data.bytes.toString("utf8"), owner: active.uid });
            return true;
        }
    };
    return data;
}

function fileSystem(state) {
    function attributes(path) {
        const file = state.files.get(path);
        const directory = state.directories.get(path);
        if (!file && !directory) { return NIL; }
        const entry = file ?? directory;
        const values = { NSFileType: file ? (entry.type ?? "NSFileTypeRegular") : "NSFileTypeDirectory", NSFileOwnerAccountID: entry.owner ?? state.uid };
        return { isNil: () => false, objectForKey: ({ js: key }) => (key === "NSFileOwnerAccountID" ? { unsignedIntValue: values[key] } : wrapped(values[key])) };
    }
    return {
        attributesOfItemAtPathError: (path) => attributes(path),
        contentsOfDirectoryAtPathError(path) {
            if (!state.directories.has(path)) { return NIL; }
            const prefix = `${path}/`;
            return wrapped([...state.files.keys(), ...state.directories.keys()]
                .filter((name) => name.startsWith(prefix) && !name.slice(prefix.length).includes("/"))
                .map((name) => name.slice(prefix.length)));
        },
        // Directories are made as asked; without intermediates, only inside one that exists.
        createDirectoryAtPathWithIntermediateDirectoriesAttributesError(path, intermediates, requested) {
            const parent = path.slice(0, path.lastIndexOf("/"));
            if (!intermediates && !state.directories.has(parent)) { return false; }
            if (!state.files.has(path) && !state.directories.has(path)) { state.directories.set(path, { owner: state.uid, attributes: requested?.js }); }
            return true;
        },
        removeItemAtPathError(path) { state.removed.push(path); state.files.delete(path); return true; },
        isExecutableFileAtPath: (path) => state.executables.has(path)
    };
}

function readingHandle(state) {
    const handle = { chunks: [], armed: false, announced: false, ended: false, armedAfterEnd: false, observer: null };
    Object.defineProperty(handle, "waitForDataInBackgroundAndNotify", { get() {
        handle.armedAfterEnd ||= handle.ended;
        handle.armed = true;
        return undefined;
    } });
    Object.defineProperty(handle, "availableData", {
        get() {
            if (!handle.announced) { throw new Error("availableData would block: no data was announced"); }
            handle.announced = false;
            const chunk = handle.chunks.shift();
            if (chunk === undefined) { handle.ended = true; return dataOf([]); }
            return dataOf(chunk);
        }
    });
    state.handles.push(handle);
    return handle;
}

function childProcess(state, executable, args) {
    const script = state.children(executable, args) ?? { stdout: [], stderr: [], status: 0 };
    const input = { written: [], closed: false, closings: 0 };
    // The task is made below; the pipe's callbacks reach it once it exists.
    const owner = {};
    const writing = {
        writeData(data) {
            if (script.brokenInput) { throw new Error("-[NSConcreteFileHandle writeData:]: Broken pipe"); }
            input.written.push(data.bytes.toString("utf8"));
            script.onInput?.(data.bytes.toString("utf8"), owner.task);
        }
    };
    Object.defineProperty(writing, "closeFile", { get() {
        if (script.brokenClose) { throw new Error("closeFile failed"); }
        input.closed = true;
        input.closings += 1;
        script.onClose?.(owner.task);
        return undefined;
    } });
    const stdout = readingHandle(state);
    const stderr = readingHandle(state);
    stdout.owner = owner;
    stderr.owner = owner;
    stdout.chunks.push(...(script.stdout ?? []));
    stderr.chunks.push(...(script.stderr ?? []));
    const task = {
        script, input, stdout, stderr, running: false, terminationStatus: 0,
        launchAndReturnError() {
            if (script.launchFails) { return false; }
            task.running = !script.exitedAtLaunch;
            state.launched.push({ executable: task.executableURL.path, args: task.arguments.js, environment: task.environment.values });
            return true;
        },
        // The process exits once its output is drained and its input has closed, unless the script
        // says otherwise; one that exits at once leaves its output in the pipe to be read.
        settle() {
            const drained = stdout.chunks.length === 0 && stderr.chunks.length === 0;
            if (task.running && (script.exitsAtOnce || (drained && (input.closed || script.exitsWithoutInput)))) {
                task.running = false;
                task.terminationStatus = script.status ?? 0;
            }
        }
    };
    owner.task = task;
    let pipes = 0;
    const pipe = () => {
        pipes += 1;
        if (pipes === 1) { return { fileHandleForWriting: writing }; }
        return { fileHandleForReading: pipes === 2 ? stdout : stderr };
    };
    return { task, pipe };
}

function processes(state) {
    const NSTask = {};
    Object.defineProperty(NSTask, "alloc", { get() {
        const created = {};
        Object.defineProperty(created, "init", { get() {
            // Configured like NSTask: the executable, then the arguments, which start the script.
            const pending = { executableURL: null };
            let real = null;
            let pipe = null;
            return new Proxy(pending, {
                get: (target, property) => (real ?? target)[property],
                set(target, property, value) {
                    if (property === "arguments") {
                        const child = childProcess(state, target.executableURL.path, value.js);
                        real = Object.assign(child.task, { executableURL: target.executableURL, arguments: value });
                        ({ pipe } = child);
                        state.tasks.push(real);
                    } else if (["standardInput", "standardOutput", "standardError"].includes(property)) {
                        real[property] = pipe();
                    } else {
                        (real ?? target)[property] = value;
                    }
                    return true;
                }
            });
        } });
        return created;
    } });
    return NSTask;
}

function dataClasses(state) {
    return {
        NSString: {
            stringWithContentsOfFileEncodingError(path) {
                const file = state.files.get(path);
                return file && !file.unreadable ? wrapped(file.content ?? "") : NIL;
            },
            alloc: { initWithDataEncoding(data) {
                try { return wrapped(new TextDecoder("utf-8", { fatal: true }).decode(data.bytes)); } catch { return NIL; }
            } }
        },
        NSData: { dataWithContentsOfFile(path) {
            const file = state.files.get(path);
            return file && !file.unreadable ? dataOf(Buffer.from(file.content ?? "", "utf8")) : NIL;
        } },
        NSUserDefaults: { alloc: { initWithSuiteName(domain) {
            state.defaults[domain.js] ??= {};
            const values = state.defaults[domain.js];
            return { isNil: () => false,
                stringForKey: (key) => (Object.hasOwn(values, key.js) ? wrapped(values[key.js]) : NIL),
                setObjectForKey(value, key) { values[key.js] = value.js; } };
        } } }
    };
}

function createFoundation(options = {}) {
    const state = {
        uid: options.uid ?? 501,
        home: options.home ?? "/Users/test",
        files: new Map(Object.entries(options.files ?? {}).map(([path, entry]) => [path, typeof entry === "string" ? { content: entry } : entry])),
        directories: new Map((options.directories ?? []).map((path) => [path, { owner: options.uid ?? 501 }])),
        executables: new Set(options.executables ?? []),
        children: options.children ?? (() => undefined),
        handles: [], tasks: [], writes: [], launched: [], removed: [], signals: [], observers: [], imports: [], blocks: [], bindings: [],
        defaults: options.defaults ?? {},
        signal: 0, renameFails: options.renameFails ?? false, writeFails: options.writeFails ?? false
    };
    active = state;
    const $ = (value) => (value === undefined ? NIL : Object.assign(wrapped(value), {
        dataUsingEncoding: () => dataOf(Buffer.from(String(value), "utf8"))
    }));
    let uuid = 0;
    Object.assign($, {
        NSFileManager: { defaultManager: fileSystem(state) },
        NSFileType: wrapped("NSFileType"), NSFileTypeRegular: wrapped("NSFileTypeRegular"), NSFileTypeDirectory: wrapped("NSFileTypeDirectory"),
        NSFileOwnerAccountID: wrapped("NSFileOwnerAccountID"), NSUTF8StringEncoding: 4, NSDataWritingWithoutOverwriting: 2,
        NSFileHandleDataAvailableNotification: "NSFileHandleDataAvailableNotification",
        ...dataClasses(state),
        NSMutableData: {},
        NSUUID: {},
        NSHomeDirectory: () => wrapped(state.home),
        NSURL: { fileURLWithPath: (path) => ({ path }) },
        NSPipe: {},
        NSProcessInfo: { processInfo: { environment: { mutableCopy: { values: {}, setObjectForKey(value, key) { this.values[key.js] = value.js; } } } } },
        NSNotificationCenter: { defaultCenter: {
            addObserverForNameObjectQueueUsingBlock(name, handle, queue, block) { handle.observer = block; state.observers.push(handle); return handle; },
            removeObserver(token) { token.observer = null; state.observers = state.observers.filter((handle) => handle !== token); }
        } },
        NSDate: { dateWithTimeIntervalSinceNow: (seconds) => ({ seconds }) },
        NSRunLoop: { currentRunLoop: { runUntilDate() {
            // A pipe announces data it holds, or its end once the process has exited.
            for (const handle of state.handles) {
                const readable = handle.chunks.length > 0 || !handle.owner.task.running;
                if (handle.armed && handle.observer && readable) { handle.armed = false; handle.announced = true; handle.observer({}); }
            }
            for (const task of state.tasks) { task.settle?.(); }
        } } },
        NSTask: processes(state)
    });
    Object.defineProperty($.NSMutableData, "data", { get: () => dataOf([]) });
    Object.defineProperty($.NSUUID, "UUID", { get() { uuid += 1; return { UUIDString: wrapped(`UUID-${uuid}`) }; } });
    Object.defineProperty($.NSPipe, "pipe", { get: () => ({}) });
    const functions = {
        getuid: () => state.uid,
        rename(from, to) {
            if (state.renameFails || !state.files.has(from)) { return -1; }
            state.files.set(to, state.files.get(from));
            state.files.delete(from);
            options.afterRename?.(state, to);
            return 0;
        },
        signal(number, handler) {
            const previous = state.signal;
            state.signals.push([number, handler]);
            state.signal = handler;
            return previous;
        }
    };
    const ObjC = {
        import: (name) => { state.imports.push(name); },
        unwrap: (value) => value?.js,
        deepUnwrap: (value) => value?.js,
        block(signature, callback) { state.blocks.push(signature); return callback; },
        bindFunction(name, signature) { state.bindings.push([name, signature]); $[name] = functions[name]; }
    };
    return { ObjC, $, state };
}

/** Install the fake as the JXA globals for the duration of `use`. */
function withFoundation(foundation, use) {
    const saved = { ObjC: globalThis.ObjC, $: globalThis.$ };
    Object.assign(globalThis, { ObjC: foundation.ObjC, $: foundation.$ });
    try { return use(); }
    finally { Object.assign(globalThis, saved); }
}

module.exports = { createFoundation, withFoundation, NIL };
