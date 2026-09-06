"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const { shellQuote, shellJoin } = require("../../../src/core/shell.js");

const NUL = String.fromCharCode(0);

test("every argument survives the shell as exactly one value", () => {
    // Executed rather than string-compared: this is the property that matters,
    // and only the shell can confirm it.
    const values = [
        "",
        "plain",
        "two words",
        "a'b",
        "$HOME; touch NO",
        "line\nfeed",
        "*",
        "--not-a-flag",
        "back\\slash",
        "tab\there",
        "Žalioji byla"
    ];
    const command = shellJoin(["printf", "%s\n"].concat(values));
    const output = execFileSync("/bin/sh", ["-c", command], { encoding: "utf8" });

    assert.equal(output, `${values.join("\n")}\n`);
});

test("shellQuote escapes embedded single quotes", () => {
    assert.equal(shellQuote("a'b"), "'a'\\''b'");
    assert.equal(shellQuote(""), "''");
    assert.equal(shellQuote("plain"), "'plain'");
});

test("shellQuote refuses NUL, which no argv can carry", () => {
    assert.throws(() => shellQuote(`a${NUL}b`), /NUL/u);
});

test("shellJoin separates arguments with a single space", () => {
    assert.equal(shellJoin(["a", "b"]), "'a' 'b'");
    assert.equal(shellJoin([]), "");
});
