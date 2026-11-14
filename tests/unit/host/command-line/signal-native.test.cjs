"use strict";
const test = require("node:test");
const { Buffer } = require("node:buffer");
const assert = require("node:assert/strict");
const { createSignalController } = require("../../../../src/host/command-line/signal-controller.js");
const { OperationError } = require("../../../../src/core/errors.js");
const { issuesOf } = require("../../../../src/core/outcomes.js");

// Model native ownership and16-byte snapshots independently of the adapter.
// Real C delivery remains established by separate native integration probes.
function nativeBridge(options = {}) {
    const allocations = new Set(), callbacks = [], log = [], sources = [];
    const old = new Map([[2, Buffer.from("efcdab89674523011122334455667708", "hex")],
        [15, Buffer.from("01000000000000008765432144332210", "hex")]]);
    const actions = new Map(Array.from(old, ([number, bytes]) => [number, Buffer.from(bytes)]));
    let blockCalls = 0, clock = 10, closeCalls = 0, mallocCalls = 0, reads = 0, sourceCalls = 0;
    const library = {}, queue = options.queue === undefined ? { isNil: () => false } : options.queue, sourceType = {};
    const ref = () => ({ 0: 0 }); ref.equals = (left, right) => left === right;
    const record = (kind, ...args) => log.push([kind, ...args]);
    function failOnce(key) { if (!options[key]) { return false; } options[key] -= 1; return true; }
    const objc = {
        import(name) { record("import", name); if (options.importError) { throw options.importError; } },
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
    function complete() { assert.equal(allocations.size, 0); assert(sources.every(source => source.released)); for (const [number, bytes] of old) { assert.deepEqual(actions.get(number), bytes, "restore all16 bytes, including prior SIG_IGN/mask/flags"); } assert.equal(log.at(-1)[0], "dlclose"); }
    return { objc, ns, ref, options, log, allocations, sources, callbacks, old, actions, complete,
        get closeCalls() { return closeCalls; }, deliver(number) { const source = sources.find(item => item.number === number); callbacks.push(() => { source.eventHandler(); return true; }); } };
}
function withBridge(fixture, body) {
    const keys = ["ObjC", "$", "Ref"], values = [fixture.objc, fixture.ns, fixture.ref];
    const prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
    try { keys.forEach((key, index) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: values[index] })); return body(); }
    finally { keys.forEach((key, index) => { if (prior[index]) { Object.defineProperty(globalThis, key, prior[index]); } else { delete globalThis[key]; } }); }
}

test("default adapter latches both signals only at checkpoints, restores all bytes and retires callbacks before release", () => {
    const fixture = nativeBridge(); withBridge(fixture, () => {
        const controller = createSignalController(); assert.equal(controller.poll(), false); fixture.deliver(2); assert.equal(controller.poll(), true); fixture.deliver(15); assert.equal(controller.poll(), true); controller.close(); fixture.complete(); const calls = fixture.log.length; controller.close(); assert.equal(fixture.log.length, calls);
        assert.deepEqual(fixture.log.filter(([kind]) => kind === "import").map(([, name]) => name), ["Foundation", "CoreFoundation", "signal", "dispatch"]);
        assert(fixture.log.some(([kind, name, signature]) => kind === "bind" && name === "sigaction" && JSON.stringify(signature) === '["int",["int","void *","void *"]]'));
        for (const number of [2, 15]) { assert(fixture.log.findIndex(([kind, eventNumber]) => kind === "ack" && eventNumber === number) < fixture.log.findIndex(([kind, eventNumber]) => kind === "release" && eventNumber === number)); }
    });
});
for (const [name, options] of [["snapshot allocation", { failMallocAt: 1 }], ["ignore allocation", { failMallocAt: 2 }], ["second snapshot", { failMallocAt: 3 }], ["second ignore allocation", { failMallocAt: 4 }], ["snapshot read", { failReadAt: 1 }], ["ignore readback", { failReadAt: 2 }], ["null source", { failSourceAt: 1 }], ["second nil source", { failSourceAt: 2, sourceNilObject: true }], ["unchanged handler", { ignoreUnchanged: true }], ["activation", { resumeFailures: 1 }]]) {
    test(`native ${name} refusal cleans all acquired resources`, () => { const fixture = nativeBridge(options); withBridge(fixture, () => assert.throws(() => createSignalController())); fixture.complete(); });
}
for (const error of [new Error("native import unavailable"), new TypeError("import fault"), new ReferenceError("missing implementation")]) {
    test(`import error classification: ${error.constructor.name}`, () => { const fixture = nativeBridge({ importError: error }); withBridge(fixture, () => assert.throws(() => createSignalController(), caught => error instanceof TypeError || error instanceof ReferenceError ? caught === error : caught instanceof OperationError && caught.cause === error)); assert.equal(fixture.closeCalls, 0); });
}
for (const [name, options] of [["missing queue", { queue: null }], ["nil queue", { queue: { isNil: () => true } }], ["missing library", { libraryNil: true }]]) {
    test(`native ${name} acquires no resources`, () => { const fixture = nativeBridge(options); withBridge(fixture, () => assert.throws(() => createSignalController(), OperationError)); assert.equal(fixture.allocations.size, 0); assert.equal(fixture.sources.length, 0); assert.equal(fixture.closeCalls, 0); });
}
for (const options of [{ symbolNil: true }, { symbolError: new TypeError("symbol fault") }, { symbolNil: true, libraryCloseFailures: 1 }, { symbolNil: true, libraryCloseError: new Error("close refused") }]) {
    test(`source symbol failure closes owned library or reports cleanup: ${Object.keys(options).join(",")}`, () => { const fixture = nativeBridge(options); withBridge(fixture, () => assert.throws(() => createSignalController(), error => { if (options.libraryCloseFailures || options.libraryCloseError) { assert(error.issues.some(issue => issue.stage === "cleanup")); } return true; })); assert.equal(fixture.closeCalls, 1); assert.equal(fixture.allocations.size, 0); });
}
for (const [name, options] of [["restore", { restoreNumber: 2, restoreFailures: 1 }], ["library close", { libraryCloseFailures: 1 }], ["source release", { releaseFailures: 1 }], ["cancel", { cancelFailures: 1 }], ["pump", { pumpFailures: 1 }], ["snapshot free", { freeFailures: 1 }]]) {
    test(`close reports ${name} failure and safely retries retained ownership`, () => { const fixture = nativeBridge(options); withBridge(fixture, () => { const controller = createSignalController(); assert.throws(() => controller.close(), OperationError); controller.close(); fixture.complete(); }); });
}
test("unacknowledged cancel retains sources/library, ignores late events and retires on later close", () => { const fixture = nativeBridge({ deferRetirement: true }); withBridge(fixture, () => { const controller = createSignalController(); assert.throws(() => controller.close(), /not be completely closed/u); assert(fixture.sources.every(source => !source.released)); assert.equal(fixture.closeCalls, 0); fixture.sources[0].eventHandler(); const before = fixture.log.length; assert.equal(controller.poll(), false); assert.equal(fixture.log.length, before); fixture.options.deferRetirement = false; controller.close(); fixture.complete(); }); });
test("event handler fault retires cancel callback without changing a disposition", () => { const failure = new TypeError("event bridge fault"), fixture = nativeBridge({ eventHandlerError: failure }); withBridge(fixture, () => assert.throws(() => createSignalController(), error => error === failure)); fixture.complete(); assert.equal(fixture.log.some(([kind]) => kind === "ignore"), false); });
test("absent cancel callback retains native source and original fault classification", () => { const fixture = nativeBridge({ cancelHandlerError: new TypeError("cancel bridge fault") }); withBridge(fixture, () => assert.throws(() => createSignalController(), error => issuesOf(error, "setup")[0].code === "fault")); assert(fixture.sources.every(source => !source.released)); assert.equal(fixture.allocations.size, 0); assert.equal(fixture.closeCalls, 0); });
test("SIG_IGN bridge fault frees check storage and restores original bytes", () => { const failure = new TypeError("signal bridge fault"), fixture = nativeBridge({ signalError: failure }); withBridge(fixture, () => assert.throws(() => createSignalController(), error => error === failure)); fixture.complete(); });
for (const key of ["objc", "ns", "ref"]) {
    test(`default native adapter refuses absent ${key} bridge component`, () => {
        const fixture = nativeBridge(); fixture[key] = null;
        withBridge(fixture, () => assert.throws(() => createSignalController(), /requires the Objective-C bridge/u));
        assert.equal(fixture.allocations.size, 0); assert.equal(fixture.sources.length, 0); assert.equal(fixture.closeCalls, 0);
    });
}
