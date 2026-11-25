"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { classifyInput } = require("../../../src/core/input-items.js");

test("raw paths remain literal and URI schemes have ASCII syntax", () => {
    for (const value of ["a.png", "/a/https://b.png", "./photo:one.jpg", "K:x.png", "bad name:x.png", "-input.png", "/a\nb.png", "/😀.png"]) {
        assert.deepEqual(classifyInput(value), { kind: "path", path: value }, value);
    }
    for (const value of ["x:a", "custom:file:///tmp/a.png", "DATA:image/png;base64,x", "custom+v1.2-x:payload", "file://elsewhere/foo.png", "file://elsewhere", "file://localhostevil/foo.png"]) {
        assert.deepEqual(classifyInput(value), { kind: "remote-url" }, value);
    }
});

test("file URLs decode once and refuse ambiguous or malformed names", () => {
    for (const [url, path] of [
        ["FILE://LOCALHOST/a/a%20b.png", "/a/a b.png"], ["file:///a/caf%C3%A9.jpg", "/a/café.jpg"],
        ["file:///a/see-file://here.png", "/a/see-file://here.png"], ["file:///a/100%25.png", "/a/100%.png"],
        ["file:///a/new%0Aline.png", "/a/new\nline.png"], ["file:///a/%25ZZ%3F%23.png", "/a/%ZZ?#.png"],
        ["file:///a/%5C.png", "/a/\\.png"]
    ]) {
        assert.deepEqual(classifyInput(url), { kind: "file-url", path }, url);
    }
    for (const value of [null, "", "file://localhost", "file:x", "file://", "file:///x%ZZ.png", "file:///x%00.png", "file:///x%EF%BF%BD.png",
        "file:///a%2fb.png", "file:///a\\b.png", "file:///a.png?x", "file:///a.png#x", "file:///a\nb.png", "\uD800.png", "a\0b.png", "a\uFFFD.png"]) {
        assert.deepEqual(classifyInput(value), { kind: "not-a-path" }, value);
    }
});

test("drive paths and drive file URLs depend on explicit Windows syntax", () => {
    const native = "C:\\Photos\\a.png";
    assert.deepEqual(classifyInput(native, true), { kind: "path", path: native });
    assert.deepEqual(classifyInput(native), { kind: "remote-url" });
    assert.deepEqual(classifyInput("file://localhost/C:/Photos/a%20b.png", true), { kind: "file-url", path: "C:/Photos/a b.png" });
    assert.deepEqual(classifyInput("file:///Photos/C:/a.png", true), { kind: "not-a-path" });
    assert.deepEqual(classifyInput("file:///C:/Photos/a%5cb.png", true), { kind: "not-a-path" });
});

test("a file URL must start the item, not appear later in it", () => {
    assert.deepEqual(classifyInput("file:a/file:///tmp/x.png"), { kind: "not-a-path" });
    assert.deepEqual(classifyInput("file:///tmp/x.png"), { kind: "file-url", path: "/tmp/x.png" });
});
