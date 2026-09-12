"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    normalizeInvocationInput,
    isHeadlessInput,
    decodeFileUrl
} = require("../../../src/core/invocation.js");

test("headless is detected through osascript's argument separator", () => {
    // osascript forwards its own "--" into run(), so the script's first
    // argument is "--". Missing this sent the headless integration suite down
    // the interactive path, where it blocked on a GUI dialog forever.
    assert.equal(isHeadlessInput(["--", "--headless", "cfg.json", "a.png"]), true);
    assert.equal(isHeadlessInput(["--headless", "cfg.json", "a.png"]), true);
    assert.equal(isHeadlessInput(["--", "--", "--headless", "cfg.json"]), true);
});

test("non-headless invocations are left alone", () => {
    assert.equal(isHeadlessInput([]), false);
    assert.equal(isHeadlessInput(["--"]), false);
    assert.equal(isHeadlessInput(undefined), false);
    assert.equal(isHeadlessInput(null), false);
    assert.equal(isHeadlessInput(["/a/b.png"]), false);
    assert.equal(isHeadlessInput("/a/b.png"), false);
});

test("normalizeInvocationInput strips only leading separators", () => {
    assert.deepEqual(normalizeInvocationInput(undefined), []);
    assert.deepEqual(normalizeInvocationInput(null), []);
    assert.deepEqual(normalizeInvocationInput("/a.png"), ["/a.png"]);
    assert.deepEqual(
        normalizeInvocationInput(["--", "--headless", "c.json"]),
        ["--headless", "c.json"]
    );
    assert.deepEqual(
        normalizeInvocationInput(["/a.png", "--", "/b.png"]),
        ["/a.png", "--", "/b.png"],
        "a separator after a real argument is data, not syntax"
    );
});

test("decodeFileUrl converts Finder URLs to POSIX paths", () => {
    assert.equal(decodeFileUrl("file:///a/b%20c.png"), "/a/b c.png");
    assert.equal(decodeFileUrl("file://localhost/a/%C5%BDalioji.png"), "/a/Žalioji.png");
    assert.equal(decodeFileUrl("file:///a/b.png"), "/a/b.png");
});

test("decodeFileUrl degrades rather than throwing on a bad escape", () => {
    assert.equal(decodeFileUrl("file:///a/%zz.png"), "/a/%zz.png");
});

test("only a leading file:// prefix is a scheme", () => {
    // Unanchored, the prefix would be removed from anywhere in the path.
    assert.equal(
        decodeFileUrl("file:///a/file:/b.png"),
        "/a/file:/b.png"
    );
});

test("a local file URL is one with no host, or localhost", () => {
    for (const url of ["file:///tmp/a.png", "file://localhost/tmp/a.png"]) {
        assert.equal(decodeFileUrl(url), "/tmp/a.png", url);
    }

    assert.equal(decodeFileUrl("FILE://LOCALHOST/tmp/a.png"), "/tmp/a.png");
});

test("a URL this action cannot open resolves to nothing, not to a relative path", () => {
    // Stripping the prefix and keeping the rest treated the authority as part
    // of the path, so "file://remotehost/tmp/a.png" became a relative path --
    // which the filesystem answers against whatever the working directory
    // happens to be. Matching the longer prefix first made it worse:
    // "file://localhostevil/tmp/a.png" became "evil/tmp/a.png".
    const refused = [
        "file://remotehost/tmp/a.png",
        "file://localhostevil/tmp/a.png",
        "file://LocalHostEvil/tmp/a.png",
        // No path at all is not a file.
        "file://localhost",
        "file://",
        // Not a file URL, so not this function's answer to give.
        "/already/posix.png",
        "http://example.com/a.png",
        // A scheme is a prefix. Unanchored, this would be read as one.
        "not-a-url-file:///a.png",
        // A literal newline cannot appear in a URL -- Finder encodes it as
        // %0A -- and matching to the end of the string is what refuses it.
        // Unanchored at that end, the path would be silently cut to "/a".
        "file:///a\nb.png"
    ];

    for (const url of refused) {
        assert.equal(decodeFileUrl(url), "", url);
    }
});

test("a name that contains file:// is not truncated", () => {
    // Only a prefix is a scheme. Unanchored, these patterns would cut the
    // name in half and leave a path that does not exist.
    assert.equal(
        decodeFileUrl("file:///a/notes%20about%20file%3A%2F%2Furls.png"),
        "/a/notes about file://urls.png"
    );
    assert.equal(
        decodeFileUrl("file:///a/see-file://localhost-here.png"),
        "/a/see-file://localhost-here.png"
    );

    // The same name inside a URL: unanchored, the pattern finds the "file://"
    // further along and cuts the middle out of it.
    assert.equal(
        decodeFileUrl("file:///a/see-file://here.png"),
        "/a/see-file://here.png"
    );
});

test("the host form is stripped whole, not down to a slash", () => {
    // file://localhost/a/b.png and file:///a/b.png name the same file. Taking
    // only "file://" off the first would leave "localhost/a/b.png", a
    // relative path.
    assert.equal(decodeFileUrl("file://localhost/a/b.png"), "/a/b.png");
    assert.equal(decodeFileUrl("FILE://LOCALHOST/a/b.png"), "/a/b.png");
    assert.equal(decodeFileUrl("File:///a/b.png"), "/a/b.png");
});

test("the caller's array is not modified while separators are stripped", () => {
    // run() is handed Finder's own array; shifting items out of it in place
    // would corrupt what the caller still holds.
    const original = ["--", "--headless", "/a/x.png"];
    const normalized = normalizeInvocationInput(original);

    assert.deepEqual(normalized, ["--headless", "/a/x.png"]);
    assert.deepEqual(
        original,
        ["--", "--headless", "/a/x.png"],
        "the input array must be left as it was"
    );
});
