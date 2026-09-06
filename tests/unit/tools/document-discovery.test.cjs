"use strict";

/*
 * Which files are documents, and what happens when two of them are broken.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/lint/document-rules.mjs");

const GOOD = "# Title\n\n## One\n\ntext\n";

test("Markdown and the two shipped plain files are documents", async () => {
    const { isDocument } = await load();

    for (const name of ["README.md", "QA.md", "INSTALL.txt", "LICENSE"]) {
        assert.equal(isDocument(name), true, name);
    }

    // The extension ends the name: a backup or a template is not the document.
    for (const name of [
        "package.json", "notes.txt", "LICENSE.js", "readme",
        "README.md.bak", "QA.md.tmpl"
    ]) {
        assert.equal(isDocument(name), false, name);
    }
});

test("the walk is asked for documents, from the repository root", async () => {
    // Asked for by predicate rather than filtered afterwards, so a directory
    // the walk skips -- .stryker-tmp holds a copy of this whole repository --
    // is never descended into for documents either.
    const { documentNames, isDocument } = await load();
    const calls = [];
    const find = (directory, base, wanted) => {
        calls.push({ directory, base, wanted });

        return Promise.resolve(["README.md"]);
    };

    assert.deepEqual(await documentNames(find), ["README.md"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].directory, "", "the whole tree");
    assert.equal(calls[0].wanted, isDocument);
});

test("a repository with no documents is an error, not a pass", async () => {
    // A check that finds nothing to check reports success either way.
    const { checkDocuments } = await load();

    await assert.rejects(
        () => checkDocuments(() => Promise.resolve(GOOD), () => Promise.resolve([])),
        /no documents found/u
    );
});

test("every document found is checked, and the text is handed back", async () => {
    const { checkDocuments } = await load();
    const find = () => Promise.resolve(["A.md", "B.md"]);
    const read = (file) => Promise.resolve(`# ${file}\n\n## One\n`);
    const documents = await checkDocuments(read, find);

    assert.deepEqual(documents.files, ["A.md", "B.md"]);
    assert.deepEqual(documents.texts, ["# A.md\n\n## One\n", "# B.md\n\n## One\n"]);
});

test("two broken documents always report the same one first", async () => {
    // They are read together but checked in order. Reporting whichever
    // rejected first would make the message depend on disk timing.
    const { checkDocuments } = await load();
    const find = () => Promise.resolve(["A.md", "B.md"]);
    // A is answered a turn later, so an implementation that reported whichever
    // finished first would report B.
    const later = (text) => Promise.resolve().then(() => Promise.resolve(text));
    const read = (file) => (file === "A.md"
        ? later("# T\n\ntext \n")
        : Promise.resolve("# T\n\ntext \n"));

    await assert.rejects(
        () => checkDocuments(read, find),
        /^Error: A\.md: has trailing whitespace$/u
    );
});
