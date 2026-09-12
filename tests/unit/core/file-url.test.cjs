"use strict";

/*
 * What a file URL denotes: a local absolute path made of characters a path
 * can hold, or nothing this action can open.
 *
 * Parsed rather than stripped of a prefix. Taking "file://" off the front and
 * keeping the rest treated the authority as part of the path, and keeping an
 * undecodable string gave two different URLs one meaning. "" is the existing
 * answer for an item that is not a path, and selection.js turns it into a
 * stated rejection naming the URL.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { decodeFileUrl } = require("../../../src/core/invocation.js");

test("a URL that will not decode is refused, not guessed at", () => {
    /*
     * Keeping the undecoded string gave two different URLs one meaning.
     * "%ZZ" is malformed -- a percent must be followed by two hexadecimal
     * digits -- and "%25ZZ" is the correct encoding of a file really called
     * that. Both resolved to the same path, so a malformed URL silently
     * selected a photograph nobody had named.
     */
    assert.equal(decodeFileUrl("file:///a/photo%20one%ZZ.png"), "");
    assert.equal(
        decodeFileUrl("file:///a/photo%2520one%25ZZ.png"),
        "/a/photo%20one%ZZ.png",
        "the correctly encoded one still names its file"
    );
});

test("a decoded path made of characters a path can hold", () => {
    // A NUL decodes without complaint and no filesystem can hold one. It used
    // to travel as far as the first shell command, where the refusal was
    // caught and reported as "not a readable file" -- true, for the wrong
    // reason.
    assert.equal(decodeFileUrl("file:///a/x%00y.png"), "");
});

test("everything a real selection produces still decodes", () => {
    const decoded = [
        ["file:///a/a b.png", "/a/a b.png"],
        ["file:///a/caf%C3%A9.jpg", "/a/café.jpg"],
        ["file:///a/100%25.png", "/a/100%.png"],
        ["file:///a/%E2%9C%93.png", "/a/✓.png"]
    ];

    for (const [url, path] of decoded) {
        assert.equal(decodeFileUrl(url), path, url);
    }
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
