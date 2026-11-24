"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/lint/document-references.mjs");

test("baseline examples are not repository paths, but supplement references are", async () => {
    const { checkDocumentReferences } = await load();
    const documents = {
        "AGENTS.md": "# Baseline\n\nPrefer `api/v2` for public versions.\n",
        "AGENTS_EXTRA.md": "# Project guidance\n\nRead `tools/missing.mjs`.\n"
    };
    const asked = [];

    await assert.rejects(
        () => checkDocumentReferences(
            (file) => Promise.resolve(documents[file]),
            () => Promise.resolve(Object.keys(documents)),
            (reference) => {
                asked.push(reference);

                return Promise.resolve(false);
            }
        ),
        /tools\/missing\.mjs \(named by AGENTS_EXTRA\.md\)/u
    );
    assert.deepEqual(asked, ["tools/missing.mjs"]);
});

test("the baseline still receives document hygiene checks", async () => {
    const { checkDocumentReferences } = await load();

    await assert.rejects(
        () => checkDocumentReferences(
            () => Promise.resolve("# Baseline\n\ntext \n"),
            () => Promise.resolve(["AGENTS.md"])
        ),
        /AGENTS\.md: has trailing whitespace/u
    );
});
