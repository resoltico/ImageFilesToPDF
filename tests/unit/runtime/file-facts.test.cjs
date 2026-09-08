"use strict";

/*
 * Which file this is, and how large.
 *
 * The identity is what makes a publication provable: a hard link shares it
 * with the file it was made from and a rename carries it along, so the output
 * path holding the same one is holding the file this run put there. An
 * identity nobody could read must therefore never compare equal to anything,
 * including another that could not be read.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { fileFacts, factsFrom } = require("../../../src/runtime/file-facts.js");
const { createFakeHost } = require("./fake-host.cjs");

test("the volume, the file number and the size come back together", () => {
    const host = createFakeHost({ files: ["/a/p.pdf"] });
    const facts = fileFacts(host, "/a/p.pdf");

    assert.match(facts.identity, /^\d+:\d+$/u);
    assert.equal(facts.size, 1024);
});

test("they are asked for in one call, in the format that yields them", () => {
    const host = createFakeHost({ files: ["/a/p.pdf"] });

    fileFacts(host, "/a/p.pdf");

    assert.deepEqual(
        host.commands.filter((command) => command.includes("stat")),
        ["'/usr/bin/stat' '-f%d:%i:%z' '/a/p.pdf'"]
    );
});

test("a file that could not be measured is not identified either", () => {
    // stat can be refused outright, and a path can simply not be there.
    const refused = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/usr/bin/stat", new Error("stat: denied")]]
    });

    assert.deepEqual(fileFacts(refused, "/a/p.pdf"), { identity: "", size: -1 });
    assert.deepEqual(
        fileFacts(createFakeHost({ files: [] }), "/a/gone.pdf"),
        { identity: "", size: -1 }
    );
});

test("an answer that is not an answer is not read as one", () => {
    // stat can succeed and still say something unusable. Treating that as an
    // identity would let two files neither of which could be read compare
    // equal, which is exactly the comparison publication turns on.
    // Including an answer with a readable size and no file behind it: the
    // size is not what identifies anything.
    for (const said of [
        "", "not a number", "16777232:99", "::", "a:b:c",
        ":5:1024", "16777232::1024"
    ]) {
        assert.deepEqual(
            factsFrom(said),
            { identity: "", size: -1 },
            JSON.stringify(said)
        );
    }
});

test("a well-formed answer is read whole", () => {
    assert.deepEqual(factsFrom("16777232:308723978:4096\n"), {
        identity: "16777232:308723978",
        size: 4096
    });
});

test("two names for one file give one identity, and a copy gives another", () => {
    // What the fake models, because it is what the filesystem does: ln shares
    // the file, mv carries it along, cp makes a different one.
    const host = createFakeHost({ files: ["/a/p.pdf"] });
    const original = fileFacts(host, "/a/p.pdf").identity;

    host.doShellScript("'/bin/ln' '/a/p.pdf' '/a/linked.pdf'");
    host.doShellScript("'/bin/cp' '-n' '/a/p.pdf' '/a/copied.pdf'");
    host.doShellScript("'/bin/mv' '-n' '/a/linked.pdf' '/a/renamed.pdf'");

    assert.equal(fileFacts(host, "/a/renamed.pdf").identity, original, "the same file");
    assert.notEqual(fileFacts(host, "/a/copied.pdf").identity, original, "another file");
});

test("what surrounds the answer does not become part of the identity", () => {
    // Identity is compared for equality, and that is what publication is
    // proved by. A reading that carried the whitespace around it would not
    // equal the same file read another way.
    assert.deepEqual(
        factsFrom(" 16777232:481:9 \n"),
        { identity: "16777232:481", size: 9 }
    );
});
