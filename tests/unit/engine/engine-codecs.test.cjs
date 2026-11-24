"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Buffer } = require("node:buffer");
const { encodeHelperRequest, readHelperReply, windowsReply } = require("../../../src/engine/platform/helper-codec.js");
const { windowsHelperArgs } = require("../../../src/engine/platform/windows-helper.js");
const { MAC_PS, MAC_OSASCRIPT } = require("../../../src/engine/executables.js");
const { absoluteOr, linuxDownload } = require("../../../src/engine/platform/linux-paths.js");

test("XDG directories use only absolute values and the documented home expansion", () => {
    assert.equal(absoluteOr("/state", "/default"), "/state");
    assert.equal(absoluteOr("relative/state", "/default"), "/default");
    assert.equal(absoluteOr(undefined, "/default"), "/default");
    assert.equal(linuxDownload('XDG_DESKTOP_DIR="$HOME/Desktop"', "/home/test"), null);
    assert.equal(linuxDownload('XDG_DOWNLOAD_DIR="$HOME"', "/home/test"), null);
    assert.equal(linuxDownload('XDG_DOWNLOAD_DIR="$HOME/a/.."', "/home/test"), null);
    assert.equal(linuxDownload('XDG_DOWNLOAD_DIR="relative"', "/home/test"), null);
    assert.equal(linuxDownload('XDG_DOWNLOAD_DIR="$HOME/Fichiers ä" # quoted directory', "/home/test"), "/home/test/Fichiers ä");
    assert.equal(linuxDownload('XDG_DOWNLOAD_DIR="/other/downloads"', "/home/test"), "/other/downloads");
    assert.equal(linuxDownload('XDG_DOWNLOAD_DIR="/literal/\\$name"', "/home/test"), "/literal/$name");
});

test("native helper codecs preserve Unicode and enforce Windows reply fields", () => {
    const request = { type: "packages", paths: ["/Café/🧪"] };
    const plain = encodeHelperRequest(request);
    const ascii = encodeHelperRequest(request, true);
    assert.match(plain, /Café\/🧪/u);
    assert.match(ascii, /^[\p{ASCII}]+$/u);
    assert.deepEqual(readHelperReply(ascii), request);
    assert.deepEqual(readHelperReply(plain), request);
    const none = { ok: true, value: null };
    const failure = { ok: false, code: -2147024891, diagnostic: "Access denied." };
    assert.equal(windowsReply(none), none);
    assert.equal(windowsReply(failure), failure);
    for (const bad of [null, "failed", [], {}, { ok: "yes" }, { ok: true },
        { ok: false, code: "1", diagnostic: "failed" }, { ok: false, code: 1 }]) {
        assert.throws(() => windowsReply(bad), /invalid response/u);
    }
    assert.throws(() => readHelperReply("{"), SyntaxError);
});

test("native helper launch declarations use pinned absolute macOS executables and UTF-8 Windows pipes", () => {
    assert.equal(MAC_PS, "/bin/ps");
    assert.equal(MAC_OSASCRIPT, "/usr/bin/osascript");
    const args = windowsHelperArgs();
    assert.deepEqual(args.slice(0,-1), ["-NoLogo","-NoProfile","-NonInteractive","-OutputFormat","Text","-EncodedCommand"]);
    const script = Buffer.from(args.at(-1), "base64").toString("utf16le");
    for (const token of ["UTF8Encoding", "OpenStandardInput", "OpenStandardOutput", "SetConsoleCtrlHandler",
        "'volume'", "'entries'", "'downloads'", "'privateDirectory'", "'startTime'", "'move'"]) { assert.ok(script.includes(token), token); }
});
