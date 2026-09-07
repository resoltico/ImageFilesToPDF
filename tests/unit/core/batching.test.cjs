"use strict";

/*
 * Every page path goes on one command line, and a command line has a size.
 * Measured on macOS: a combined PDF of 8,000 pages was accepted and 12,000
 * failed, with "An error occurred." -- nothing a person can act on. Selecting
 * ten thousand images by hand is unlikely; selecting a folder holding them is
 * one click.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    batchPages,
    commandLengthOf,
    COMMAND_BUDGET_BYTES
} = require("../../../src/core/batching.js");

const FIXED = ["/opt/homebrew/bin/pdfcpu", "import", "--", "dim:1 2", "/o.pdf"];
const pagesOf = (count) => Array.from(
    { length: count },
    (unused, index) => `/tmp/ws/page_${String(index).padStart(6, "0")}.jpg`
);

test("an ordinary job is one command, as it always was", () => {
    assert.equal(batchPages(pagesOf(20), FIXED).length, 1);
    assert.equal(batchPages(pagesOf(1), FIXED).length, 1);
});

test("a job too large for one command is divided, in order", () => {
    const pages = pagesOf(12000);
    const batches = batchPages(pages, FIXED);

    assert.ok(batches.length > 1, `expected more than one batch: ${batches.length}`);
    assert.deepEqual(batches.flat(), pages, "every page, in the order given");
});

test("no batch would exceed the budget once it is written out", () => {
    // The check is on the command as it will actually be run: quoted, with
    // the separators, and with the fixed part of the argv counted too.
    for (const batches of [
        batchPages(pagesOf(12000), FIXED),
        batchPages(pagesOf(300), FIXED, 2048)
    ]) {
        for (const batch of batches) {
            assert.ok(
                commandLengthOf(FIXED.concat(batch)) <= COMMAND_BUDGET_BYTES,
                `a batch of ${batch.length} is too long`
            );
        }
    }
});

test("the budget is spent on the paths as they really are", () => {
    // Long paths mean fewer pages per command. Assuming a count instead would
    // be right for one workspace and wrong for another.
    const short = batchPages(pagesOf(400), FIXED, 4096);
    const long = batchPages(
        pagesOf(400).map((page) => `/var/folders/xx/T/deeply/nested${page}`),
        FIXED,
        4096
    );

    assert.ok(
        long.length > short.length,
        `${long.length} batches of long paths vs ${short.length} of short`
    );
});

test("a page too long for any command is still its own batch", () => {
    // One page is as far as this can divide. Refusing it would be refusing
    // the page rather than the command.
    const batches = batchPages(pagesOf(3), FIXED, 1);

    assert.deepEqual(batches.map((batch) => batch.length), [1, 1, 1]);
});

test("the length counted is the command as the shell will see it", () => {
    // Quoted, and with a separator between each. Counting anything else makes
    // the budget a number about nothing, and every check below self-consistent
    // and wrong together.
    assert.equal(commandLengthOf(["ab"]), "'ab' ".length);
    assert.equal(commandLengthOf(["ab", "cd"]), "'ab' 'cd' ".length);
    assert.equal(commandLengthOf([]), 0);
});

test("a batch that exactly fills the budget is not divided", () => {
    // The boundary is where a command is too long, not where it reaches the
    // limit: refusing at the limit would waste one page in every batch.
    const one = commandLengthOf(["/tmp/a.jpg"]);
    const budget = commandLengthOf(FIXED) + one * 2;

    assert.equal(
        batchPages(["/tmp/a.jpg", "/tmp/b.jpg"], FIXED, budget).length,
        1
    );
    assert.equal(
        batchPages(["/tmp/a.jpg", "/tmp/b.jpg"], FIXED, budget - 1).length,
        2
    );
});

test("no pages is no commands", () => {
    assert.deepEqual(batchPages([], FIXED), []);
});
