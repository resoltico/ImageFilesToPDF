"use strict";

/*
 * These documents name modules constantly, and this repository moves modules.
 * A reference that no longer resolves sends a reader to something that is not
 * there, and the prose still reads perfectly, so nothing else would notice.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/lint/document-references.mjs");

const documentsOf = (texts) => ({
    files: Object.keys(texts),
    texts: Object.values(texts)
});

test("a backticked path with a separator is a reference", async () => {
    const { referencesIn } = await load();

    assert.deepEqual(
        referencesIn("See `src/core/shell.js` and `tools/lint/` for this."),
        ["src/core/shell.js", "tools/lint/"]
    );
});

test("prose that is not a path is not a reference", async () => {
    // A filename with no directory in it is as likely to be a word, and a
    // command is not a path at all.
    const { referencesIn } = await load();

    assert.deepEqual(referencesIn("`README.md` `mv -n` `--mode=strict`"), []);
    assert.deepEqual(referencesIn("plain src/core/shell.js unquoted"), []);
    // A fraction has a separator and no name: prose is full of them.
    assert.deepEqual(referencesIn("`1/2` of `210/25.4` points"), []);
});

test("an ellipsis means a shape rather than a file", async () => {
    // QA.md writes `./.github/actions/...` to describe the form of a local
    // action, which is not a path anybody could resolve.
    const { referencesIn } = await load();

    assert.deepEqual(referencesIn("a local `./.github/actions/...` action"), []);
});

test("a reference that does not resolve is reported with the document", async () => {
    const { missingReferences } = await load();
    const documents = documentsOf({
        "README.md": "See `tools/gone.mjs` and `src/core/shell.js`.\n",
        "QA.md": "Also `tools/gone.mjs`.\n"
    });
    const resolve = (reference) => Promise.resolve(reference !== "tools/gone.mjs");

    assert.deepEqual(await missingReferences(documents, resolve), [
        "tools/gone.mjs (named by QA.md)"
    ]);
});

test("more than one missing reference reads as a list, in a fixed order", async () => {
    // The gate's output has to say the same thing twice running, and two
    // names run together are a third name that exists nowhere.
    const { checkDocumentReferences } = await load();
    const find = () => Promise.resolve(["a.md"]);
    const read = () => Promise.resolve(
        "# T\n\n## S\n\n`tools/z.mjs` then `tools/a.mjs`\n"
    );

    await assert.rejects(
        () => checkDocumentReferences(read, find, () => Promise.resolve(false)),
        (error) => {
            assert.equal(error.message, "documents name files that are not " +
                "there: tools/a.mjs (named by a.md), tools/z.mjs (named by a.md)");

            return true;
        }
    );
});

test("a trailing separator is a directory, not part of the name", async () => {
    const { missingReferences } = await load();
    const asked = [];
    const resolve = (reference) => {
        asked.push(reference);

        return Promise.resolve(true);
    };

    await missingReferences(documentsOf({ "a.md": "`src/core/`\n" }), resolve);
    assert.deepEqual(asked, ["src/core"]);
});

test("the check fails the gate, naming every reference that is gone", async () => {
    const { checkDocumentReferences } = await load();
    const find = () => Promise.resolve(["a.md"]);
    const read = () => Promise.resolve("# T\n\n## S\n\n`tools/gone.mjs`\n");

    await assert.rejects(
        () => checkDocumentReferences(read, find, () => Promise.resolve(false)),
        /documents name files that are not there: tools\/gone\.mjs \(named by a\.md\)/u
    );
    assert.equal(
        await checkDocumentReferences(read, find, () => Promise.resolve(true)),
        1
    );
});

test("a broken document is reported before its references are resolved", async () => {
    // Structure first: a spliced document names everything twice, and a list
    // of references is not what a reader needs to be told about it.
    const { checkDocumentReferences } = await load();

    await assert.rejects(
        () => checkDocumentReferences(
            () => Promise.resolve("# T\n\n## S\n\n## S\n"),
            () => Promise.resolve(["a.md"]),
            () => Promise.resolve(false)
        ),
        /repeats ## S in the same place/u
    );
});

test("a reference is resolved against the repository, not the cwd", async () => {
    // The gate can be run from anywhere; a path in a document is relative to
    // the repository it is written in.
    const { exists } = await load();
    const asked = [];

    assert.equal(await exists("src/core/shell.js", (at) => asked.push(at)), true);
    assert.match(asked[0], /\/src\/core\/shell\.js$/u);
    assert.notEqual(asked[0], "src/core/shell.js", "joined to the root");

    assert.equal(
        await exists("tools/gone.mjs", () => {
            throw new Error("ENOENT");
        }),
        false,
        "unreachable is an answer, not a failure"
    );
});
