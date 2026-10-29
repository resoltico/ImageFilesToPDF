"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { sourceAccess } = require("../../../src/host/source-capture.js");

function fixture(overrides = {}) {
    const events = [];
    let sourceChecks = 0;
    function observedSize(path) {
        if (path === "/owned") { return overrides.snapshotSize ?? 20; }
        return sourceChecks > 1 ? overrides.capturedSize ?? 20 : 20;
    }
    function attributes(path) {
        if (Object.hasOwn(overrides, "attributes")) { return overrides.attributes; }
        if (path === "/source") { sourceChecks += 1; }
        const identity = sourceChecks > 1 ? overrides.afterIdentity ?? "1:2" : overrides.identity ?? "1:2";
        const [device = "", file = ""] = identity.split(":");
        const size = observedSize(path);
        const kind = path === "/owned" ? overrides.snapshotKind ?? "file" : overrides.kind ?? "file";
        const values = { device, file, size, kind: kind === "file" ? "NSFileTypeRegular" : "NSFileTypeSymbolicLink",
            mtime: sourceChecks > 1 ? overrides.modified ?? 1 : 1, ctime: 1 };
        return require("../ports/fake-attributes.cjs").nativeAttributes(values);
    }
    const ns = (value) => ({ value, localizedDescription: "copy denied" });
    Object.assign(ns, { NSFileType: "kind", NSFileSystemNumber: "device", NSFileSystemFileNumber: "file",
        NSFileSize: "size", NSFileModificationDate: "mtime", NSFileCreationDate: "ctime",
        NSFileManager: { defaultManager: {
            attributesOfItemAtPathError: (path) => attributes(path.value),
            isReadableFileAtPath: () => overrides.readable ?? true,
            copyItemAtPathToPathError: () => overrides.copy ?? true
        } },
        NSURL: { fileURLWithPath: (path) => path },
        CGImageSourceCreateWithURL: () => { events.push("create"); return {}; },
        CGImageSourceGetCount: () => overrides.count ?? 1,
        CFRelease: () => { events.push("release"); }
    });
    const objc = { import: (name) => { events.push(name); }, bindFunction: (name, type) => { events.push([name, type]); },
        unwrap: (value) => value?.boxed ?? value,
        castRefToObject: () => ({ isNil: () => overrides.nil ?? false }) };
    return { access: sourceAccess(objc, ns), events };
}

test("source capabilities are mandatory", () => {
    assert.equal(sourceAccess(null, {}, {}), null);
    assert.equal(sourceAccess({}, null, {}), null);
});

test("capture returns the private copy with original identity/version", () => {
    const sample = fixture();
    assert.deepEqual(sample.access.capture("/source", "/owned"), { path: "/owned", identity: "1:2", version: "1:1:20" });
});

for (const options of [{kind:"other"}, {identity:""}, {afterIdentity:"1:3"}, {copy:false}, {attributes:{isNil:()=>true}}]) {
    test(`unsafe capture is refused ${Object.keys(options)}`, () => {
        assert.throws(() => fixture(options).access.capture("/source", "/owned"));
    });
}

test("PNG count owns and releases its CF source even on invalid metadata", () => {
    const sample = fixture();
    assert.equal(sample.access.pngCount("/owned"), 1);
    assert.equal(sample.events.filter((event) => event === "release").length, 1);
    const invalid = fixture({count:0});
    assert.throws(() => invalid.access.pngCount("/owned"), /Invalid PNG/u);
    assert.equal(invalid.events.filter((event) => event === "release").length, 1);
    const nil = fixture({nil:true});
    assert.throws(() => nil.access.pngCount("/owned"), /unavailable/u);
    assert.ok(!nil.events.includes("release"));
});

test("capture failures name the original source and keep native details separate", () => {
    for (const options of [{ modified: 2 }, { capturedSize: 19 }, { snapshotSize: 19 }]) {
        assert.throws(() => fixture(options).access.capture("/source", "/owned"), (error) =>
            error.message === "/source: The source changed after selection; try again when it is stable." && error.issues[0].source === "/source");
    }
    for (const [options, reason] of [[{ snapshotKind: "other" }, /regular non-link/u], [{ attributes: null }, /attributes are unavailable/u], [{ copy: false }, /copy denied/u]]) {
        assert.throws(() => fixture(options).access.capture("/source", "/owned"), (error) => {
            assert.equal(error.message, "/source: This file could not be copied for conversion.");
            assert.match(error.issues[0].diagnostic.message, reason);
            assert.equal(error.issues[0].source, "/source");
            return true;
        });
    }
});

test("admission can read native file facts and access without copying", () => {
    const sample = fixture();
    assert.deepEqual(sample.access.facts("/source"), { identity: "1:2", size: "20", version: "1:1:20" });
    assert.equal(sample.access.readable("/source"), true);
    assert.equal(fixture({ readable: false }).access.readable("/source"), false);
});

test("native ImageIO ownership binding is explicit and imported once",()=>{
    const {events}=fixture();
    assert.deepEqual(events,["Foundation","ImageIO","CoreFoundation",["CFRelease",["void",["void *"]]]]);
});

test("unreadable native version facts are not relabelled as a stable snapshot",()=>{
    assert.throws(()=>fixture({modified:NaN}).access.capture("/source","/owned"),(error)=>error.issues[0].diagnostic.message==="Source must be an identifiable regular non-link file with readable version facts.");
});
