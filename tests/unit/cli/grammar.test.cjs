"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseArgs } = require("../../../src/cli/grammar.js");

test("the CLI accepts paths with or without the optional separator", () => {
    const first = { kind: "run", file: "settings.json", inputItems: ["a.png", "b.jpg"] };
    assert.deepEqual(parseArgs(["--settings", "settings.json", "a.png", "b.jpg"]), first);
    assert.deepEqual(parseArgs(["--settings", "settings.json", "--", "a.png", "b.jpg"]), first);
    assert.deepEqual(parseArgs(["--settings", "s", "a", "--", "-b", "--"]), { kind: "run", file: "s", inputItems: ["a", "-b", "--"] });
});

test("the CLI reports an exact grammar problem without consuming a source as an option", () => {
    const cases = [
        [[], "No arguments were given."], [["--settings", "", "--", "x"], "An argument is empty."],
        [["photo.png"], "--settings must precede the source paths."], [["--wrong"], "Unknown option: --wrong."],
        [["--settings"], "--settings needs a settings file."], [["--settings", "-h", "x"], "--settings needs a settings file."],
        [["--settings", "s"], "At least one source path is required."], [["--settings", "s", "--"], "At least one source path is required."],
        [["--settings", "s", "-a"], "Unknown option: -a."], [["--settings", "s", "a", "-b"], "Unknown option: -b."],
        [["-h", "x"], "-h takes no other arguments."], [["--help", "x"], "--help takes no other arguments."],
        [["--version", "x"], "--version takes no other arguments."]
    ];
    for (const [args, problem] of cases) { assert.deepEqual(parseArgs(args), { problem }); }
    assert.deepEqual(parseArgs(["-h"]), { kind: "help" });
    assert.deepEqual(parseArgs(["--help"]), { kind: "help" });
    assert.deepEqual(parseArgs(["--version"]), { kind: "version" });
});
