"use strict";
const assert = require("node:assert/strict");
const { Buffer } = require("node:buffer");

// Model native ownership and 16-byte snapshots independently of the adapter.
// Real C delivery remains established by separate native integration probes.
function nativeBridge(options = {}) {
    const allocations = new Set(), callbacks = [], log = [], sources = [];
    const old = new Map([[13, Buffer.from("00000000000000008765432144332210", "hex")], [2, Buffer.from("efcdab89674523011122334455667708", "hex")],
        [15, Buffer.from("01000000000000008765432144332210", "hex")]]);
    const actions = new Map(Array.from(old, ([number, bytes]) => [number, Buffer.from(bytes)]));
    let blockCalls = 0, clock = 10, closeCalls = 0, mallocCalls = 0, reads = 0, sourceCalls = 0;
    const library = {}, queue = options.queue === undefined ? { isNil: () => false } : options.queue, sourceType = {};
    const ref = () => ({ 0: 0 }); ref.equals = (left, right) => left === right;
    const record = (kind, ...args) => log.push([kind, ...args]);
    function failOnce(key) { if (!options[key]) { return false; } options[key] -= 1; return true; }
    const objc = {
        import(name) { record("import", name); if (options.importError && (!options.importName || options.importName === name)) { throw options.importError; } },
        bindFunction(name, signature) { record("bind", name, signature); if (name === options.bindName) { throw options.bindError; } },
        block(signature, callback) { blockCalls += 1; record("block", blockCalls, signature); if (blockCalls === options.failBlockAt) { throw options.blockError; } return callback; }
    };
    const ns = {
        NSValue: { valueWithPointer(value) { assert.equal(value, null); return { pointerValue: null }; } },
        NSOperationQueue: { mainQueue: { underlyingQueue: queue } },
        NSProcessInfo: { processInfo: { get systemUptime() { return clock; } } },
        kCFRunLoopDefaultMode: {},
        dlopen(file, flags) { record("dlopen", file, flags); return options.libraryNil ? null : library; },
        dlsym(handle, symbol) { assert.equal(handle, library); record("dlsym", symbol); if (options.symbolError) { throw options.symbolError; } return options.symbolNil ? null : sourceType; },
        dlclose(handle) { assert.equal(handle, library); closeCalls += 1; record("dlclose"); if (options.libraryCloseError) { throw options.libraryCloseError; } return failOnce("libraryCloseFailures") ? -1 : 0; },
        malloc(bytes) { assert.equal(bytes, 16); mallocCalls += 1; if (mallocCalls === options.failMallocAt) { return null; } const memory = Buffer.alloc(bytes, 0xa5); allocations.add(memory); record("allocate", memory); return memory; },
        free(memory) { assert(allocations.has(memory), "native allocation freed exactly once"); if (memory.readBigUInt64LE() !== 1n && failOnce("freeFailures")) { throw new TypeError("snapshot free bridge fault"); } allocations.delete(memory); record("free", memory); },
        sigaction(number, incoming, outgoing) {
            assert(actions.has(number));
            if (incoming) { assert.equal(outgoing, null); assert(allocations.has(incoming)); record("restore", number, Buffer.from(incoming)); if (number === options.restoreNumber && failOnce("restoreFailures")) { return -1; } actions.set(number, Buffer.from(incoming)); return 0; }
            assert(allocations.has(outgoing)); reads += 1; record("read", number, reads); if (reads === options.failReadAt) { return -1; } actions.get(number).copy(outgoing); return 0;
        },
        signal(number, handler) { assert.equal(handler, 1); record("ignore", number); if (options.signalError) { throw options.signalError; } if (!options.ignoreUnchanged) { const bytes = Buffer.alloc(16); bytes.writeBigUInt64LE(1n); actions.set(number, bytes); } return 0; },
        memcmp(left, right, bytes) { assert.equal(bytes, 8); const expected = Buffer.alloc(8); expected.writeBigUInt64LE(BigInt(right[0])); return Buffer.compare(left.subarray(0, bytes), expected); },
        "dispatch_source_create"(type, number, mask, target) {
            assert.equal(type, sourceType); assert.equal(mask, 0); assert.equal(target, queue); sourceCalls += 1;
            if (sourceCalls === options.failSourceAt) { return options.sourceNilObject ? { isNil: () => true } : null; }
            const source = { number, active: false, canceled: false, retired: false, released: false, isNil: () => false }; sources.push(source); record("source", number); return source;
        },
        "dispatch_source_set_cancel_handler"(source, callback) { if (options.cancelHandlerError) { throw options.cancelHandlerError; } source.cancelHandler = callback; record("cancel-handler", source.number); },
        "dispatch_source_set_event_handler"(source, callback) { if (options.eventHandlerError) { throw options.eventHandlerError; } source.eventHandler = callback; record("event-handler", source.number); },
        "dispatch_resume"(source) { if (failOnce("resumeFailures")) { throw new Error("native resume refused"); } assert(!source.active); source.active = true; record("resume", source.number); },
        "dispatch_source_cancel"(source) { if (failOnce("cancelFailures")) { throw new TypeError("cancel bridge fault"); } assert(!source.canceled); source.canceled = true; record("cancel", source.number); callbacks.push(() => { if (!source.active || options.deferRetirement) { return false; } if (source.cancelHandler) { source.cancelHandler(); source.retired = true; record("ack", source.number); } return true; }); },
        "dispatch_release"(source) { assert(source.retired, "C-owned callbacks retire before release"); assert(!source.released); if (failOnce("releaseFailures")) { throw new TypeError("release bridge fault"); } source.released = true; record("release", source.number); },
        CFRunLoopRunInMode(mode, seconds, returnAfterSource) { assert.equal(mode, ns.kCFRunLoopDefaultMode); assert.equal(seconds, 0.001); assert.equal(returnAfterSource, false); clock += 0.02; record("pump"); if (failOnce("pumpFailures")) { throw new Error("run loop unavailable"); } const callback = callbacks.shift(); if (callback && callback() === false) { callbacks.push(callback); } }
    };
    function complete() { assert.equal(allocations.size, 0); assert(sources.every(source => source.released)); for (const [number, bytes] of old) { assert.deepEqual(actions.get(number), bytes, "restore all 16 bytes, including prior SIG_IGN/mask/flags"); } assert.equal(log.at(-1)[0], "dlclose"); }
    return { objc, ns, ref, options, log, allocations, sources, callbacks, old, actions, complete,
        get closeCalls() { return closeCalls; }, deliver(number) { const source = sources.find(item => item.number === number); callbacks.push(() => { source.eventHandler(); return true; }); } };
}
function withBridge(fixture, body) {
    const keys = ["ObjC", "$", "Ref"], values = [fixture.objc, fixture.ns, fixture.ref];
    const prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
    try { keys.forEach((key, index) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: values[index] })); return body(); }
    finally { keys.forEach((key, index) => { if (prior[index]) { Object.defineProperty(globalThis, key, prior[index]); } else { delete globalThis[key]; } }); }
}

module.exports = { nativeBridge, withBridge };
