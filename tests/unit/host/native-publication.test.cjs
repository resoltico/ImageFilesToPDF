"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { nativePublication, classify } = require("../../../src/host/native-publication.js");
const { nativeAttributes } = require("../ports/fake-attributes.cjs");

for (const [code, state] of [[17,"exists"],[18,"cross-device"],[45,"unsupported"],[78,"unsupported"],[1,"denied"],[13,"denied"],[30,"denied"],[999,"unknown"]]) {
    test(`POSIX ${code} maps to ${state}`, () => assert.equal(classify(code,"NSPOSIXErrorDomain"),state));
}
test("unknown native domains are not guessed from English messages", () => assert.equal(classify(516,"NSCocoaErrorDomain"),"unknown"));
test("missing native bridge has no weak fallback", () => {
    assert.equal(nativePublication(null,{}),null); assert.equal(nativePublication({},null),null);
});

test("POSIX claims preserve exact spelling and read errno immediately", () => {
    const events = [];
    const ns = { NSFileManager: { defaultManager: {} },
        link: (...args) => { events.push(["link", ...args]); return -1; },
        "renamex_np": (...args) => { events.push(["rename", ...args]); return -1; },
        "__error": () => { events.push("errno"); return [17]; }, strerror: (code) => { events.push("strerror"); return `native ${code}`; } };
    const port = nativePublication({ import: () => true, bindFunction: () => true }, ns);
    assert.deepEqual(port.link("/a", "/rīga.pdf"), { state: "exists", diagnostic: { code: 17, domain: "NSPOSIXErrorDomain", message: "native 17" } });
    assert.deepEqual(events, [["link", "/a", "/rīga.pdf"], "errno", "strerror"]);
    events.length = 0;
    assert.equal(port.rename("/a", "/b").state, "exists");
    assert.deepEqual(events, [["rename", "/a", "/b", 4], "errno", "strerror"]);
    Object.assign(ns, { link: () => 0, "renamex_np": () => 0 });
    assert.deepEqual(port.link("/a", "/b"), { state: "created" });
    assert.deepEqual(port.rename("/a", "/b"), { state: "created" });
});

test("native imports bind both atomic POSIX operations", () => {
    const events = [];
    nativePublication({ import: (name) => events.push(name), bindFunction: (...args) => events.push(args) }, { NSFileManager: { defaultManager: {} } });
    assert.deepEqual(events, ["Foundation", "stdio", ["__error", ["int *", []]], ["strerror", ["char *", ["int"]]], ["link", ["int", ["char *", "char *"]]]]);
});

function namedFixture() {
    const actual = "/chosen/rīga.pdf", canonical = "/resolved/rīga.pdf", intended = "/chosen/rīga.pdf";
    const attributes = new Map([intended, canonical, actual].map((path) => [path, { kind: "NSFileTypeRegular", device: "1", file: "2", size: 4096 }]));
    const ns = (value) => value ?? {};
    Object.assign(ns, { NSFileType: "kind", NSFileSystemNumber: "device", NSFileSystemFileNumber: "file", NSFileSize: "size", NSURLCanonicalPathKey: "canonical",
        NSFileManager: { defaultManager: { attributesOfItemAtPathError: (path) => nativeAttributes(attributes.get(path)) } },
        NSURL: { fileURLWithPath(path) { assert.equal(path, intended); return { resourceValuesForKeysError: () => ({ isNil: () => false, objectForKey: () => ({ boxed: canonical, isNil: () => false }) }) }; } } });
    const port = nativePublication({ import: () => true, bindFunction: () => true, unwrap: (value) => value?.boxed ?? value }, ns);
    return { port, attributes, intended, canonical, actual, ns, expected: { identity: "1:2", size: 4096 } };
}

test("stored basename readback keeps the chosen parent and verifies every owned path", () => {
    const sample = namedFixture();
    assert.equal(sample.port.actualPath(sample.intended, sample.expected), sample.actual);
    for (const path of [sample.intended, sample.canonical, sample.actual]) {
        const fixture = namedFixture(); fixture.attributes.set(path, { kind: "NSFileTypeRegular", device: "1", file: "9", size: 4096 });
        assert.throws(() => fixture.port.actualPath(fixture.intended, fixture.expected), /identity/u);
    }
});

test("missing name values and a replacement during lookup cannot become confirmed names", () => {
    for (const values of [null, { isNil: () => true }, { isNil: () => false, objectForKey: () => null }, { isNil: () => false, objectForKey: () => ({ isNil: () => true }) }]) {
        const sample = namedFixture(); sample.ns.NSURL.fileURLWithPath = () => ({ resourceValuesForKeysError: () => values });
        assert.throws(() => sample.port.actualPath(sample.intended, sample.expected), /stored filename/u);
    }
    const sample = namedFixture(); const native = sample.ns.NSURL.fileURLWithPath;
    sample.ns.NSURL.fileURLWithPath = (path) => { const url = native(path); sample.attributes.delete(sample.canonical); return url; };
    assert.throws(() => sample.port.actualPath(sample.intended, sample.expected), /identity changed/u);
});
