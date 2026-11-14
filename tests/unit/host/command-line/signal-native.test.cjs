"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createSignalController } = require("../../../../src/host/command-line/signal-controller.js");
const { OperationError } = require("../../../../src/core/errors.js");
const { issuesOf } = require("../../../../src/core/outcomes.js");
const { nativeBridge, withBridge } = require("./signal-bridge.cjs");

test("default adapter latches both signals only at checkpoints, restores all bytes and retires callbacks before release", () => {
    const fixture = nativeBridge(); withBridge(fixture, () => {
        const controller = createSignalController(); assert.equal(controller.poll(), false); fixture.deliver(2); assert.equal(controller.poll(), true); fixture.deliver(15); assert.equal(controller.poll(), true); controller.close(); fixture.complete(); const calls = fixture.log.length; controller.close(); assert.equal(fixture.log.length, calls);
        assert.deepEqual(fixture.log.filter(([kind]) => kind === "import").map(([, name]) => name), ["Foundation", "signal", "CoreFoundation", "dispatch"]);
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

for (const cause of [new Error("dispatch framework unavailable"), new TypeError("dispatch import fault"), new ReferenceError("dispatch import missing")]) {
    test(`dispatch-only binding classification after shared actions setup: ${cause.constructor.name}`, () => {
        const fixture = nativeBridge({ importName: "CoreFoundation", importError: cause });
        withBridge(fixture, () => assert.throws(() => createSignalController(), (error) =>
            cause instanceof TypeError || cause instanceof ReferenceError ? error === cause : error instanceof OperationError && error.cause === cause));
        assert.equal(fixture.allocations.size, 0); assert.equal(fixture.closeCalls, 0);
    });
}
