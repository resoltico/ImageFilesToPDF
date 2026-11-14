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
    const actual = "/chosen/rīga.pdf", intended = "/chosen/rīga.pdf";
    const attributes = new Map([intended, actual, "/chosen/another-link.pdf"].map((path) => [path, { kind: "NSFileTypeRegular", device: "1", file: "2", size: 4096 }]));
    const entries = ["rīga.pdf", "another-link.pdf"];
    const listing = { isNil: () => false, entries };
    const manager = { attributesOfItemAtPathError: (path) => nativeAttributes(attributes.get(path)), contentsOfDirectoryAtPathError: () => listing };
    const ns = (value) => value ?? {};
    Object.assign(ns, { NSFileType: "kind", NSFileSystemNumber: "device", NSFileSystemFileNumber: "file", NSFileSize: "size", NSFileManager: { defaultManager: manager } });
    const port = nativePublication({ import: () => true, bindFunction: () => true, unwrap: (value) => value?.boxed ?? value, deepUnwrap: (value) => value.entries }, ns);
    return { port, attributes, intended, actual, entries, manager, expected: { identity: "1:2", size: 4096 } };
}

test("literal directory-entry basename retains chosen parent and never chooses another hardlink by inode alone", () => {
    const sample = namedFixture();
    assert.equal(sample.port.actualPath(sample.intended, sample.expected), sample.actual);
    for (const path of [sample.intended, sample.actual]) {
        const fixture = namedFixture(); fixture.attributes.set(path, { kind: "NSFileTypeRegular", device: "1", file: "9", size: 4096 });
        assert.throws(() => fixture.port.actualPath(fixture.intended, fixture.expected), /identity|uniquely verified/u);
    }
    sample.entries.push("rīga.pdf");
    assert.equal(sample.port.actualPath(sample.intended, sample.expected), sample.intended, "literal exact name has priority over canonical-equivalent aliases");
});

test("listing refusal, missing and ambiguous names preserve name uncertainty rather than canonical fallback", () => {
    for (const listed of [null, { isNil: () => true }]) {
        const sample = namedFixture(); sample.manager.contentsOfDirectoryAtPathError = () => listed;
        assert.throws(() => sample.port.actualPath(sample.intended, sample.expected), /read.*stored filename/u);
    }
    const missing = namedFixture(); missing.entries.splice(0);
    assert.throws(() => missing.port.actualPath(missing.intended, missing.expected), /uniquely verified/u);
    const ambiguous = namedFixture();
    ambiguous.entries.splice(0, ambiguous.entries.length, "Å.pdf", "Å.pdf");
    for (const name of ["Å.pdf", ...ambiguous.entries]) { ambiguous.attributes.set(`/chosen/${name}`, { kind: "NSFileTypeRegular", device: "1", file: "2", size: 4096 }); }
    assert.throws(() => ambiguous.port.actualPath("/chosen/Å.pdf", ambiguous.expected), /uniquely verified/u);
});

test("replacement during enumeration cannot become a confirmed stored name", () => {
    const sample = namedFixture(); const list = sample.manager.contentsOfDirectoryAtPathError;
    sample.manager.contentsOfDirectoryAtPathError = (...args) => {
        sample.attributes.set(sample.actual, { kind: "NSFileTypeRegular", device: "1", file: "9", size: 4096 }); return list(...args);
    };
    assert.throws(() => sample.port.actualPath(sample.intended, sample.expected), /uniquely verified/u);
});
