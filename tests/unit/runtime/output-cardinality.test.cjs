"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createCombinedPdf } = require("../../../src/runtime/pdf.js");
const { createSeparatePdfs } = require("../../../src/runtime/pdf-separate.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");

test("single-batch PDFs with lost or extra pages are never published", () => {
    for (const count of [1, 3]) {
        const host = createFakeHost({
            files: ["/a/1.png", "/a/2.png"],
            failures: [["'info'", `Page count: ${count}\n`]]
        });

        assert.throws(() => createCombinedPdf(makeJob(host), [
            imageOf("/a/1.png"), imageOf("/a/2.png")
        ]), new RegExp(`the PDF has ${count} pages where 2 were imported`, "u"));
        assert.deepEqual([...host.files].filter((path) => path.endsWith(".pdf")), []);
        assert.ok(!host.commands.some((command) => command.includes("'validate'")),
            "a mismatched count must stop before validation or publication");
    }
});

test("unknown page counts are errors, not fabricated zero-page results", () => {
    const host = createFakeHost({
        files: ["/a/1.png"], failures: [["'info'", "Page count: 1junk\n"]]
    });

    assert.throws(() => createCombinedPdf(makeJob(host), [imageOf("/a/1.png")]),
        /the PDF page count could not be verified/u);
    assert.ok(![...host.files].some((path) => path.endsWith(".pdf")));
});

test("separate mode rejects a non-single-page PDF and continues with other images", () => {
    let inspected = 0;
    const host = createFakeHost({
        files: ["/a/1.png", "/a/2.png"],
        failures: [["'info'", () => {
            inspected += 1;

            return `Page count: ${inspected === 1 ? 2 : 1}\n`;
        }]]
    });
    const result = createSeparatePdfs(makeJob(host), [
        imageOf("/a/1.png"), imageOf("/a/2.png")
    ]);

    assert.equal(inspected, 2);
    assert.deepEqual(result.outputs, ["/a/2_20260904_010203.pdf"]);
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0].message, /2 pages where 1 were imported/u);
});
