"use strict";

/*
 * A heading is where it is as much as what it says. Compared whole, a Keep a
 * Changelog file repeats "### Fixed" under every release that fixed
 * something, and those are different sections.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/lint/document-rules.mjs");

test("a heading is placed under the headings it sits below", async () => {
    const { headingPathsIn } = await load();
    const paths = headingPathsIn("# T\n\n## A\n\n### X\n\n## B\n\n### X\n");

    assert.deepEqual(paths.map((heading) => heading.path), [
        "# T",
        "# T > ## A",
        "# T > ## A > ### X",
        "# T > ## B",
        "# T > ## B > ### X"
    ]);
});

test("a level skipped over does not put a gap in the path", async () => {
    const { headingPathsIn } = await load();
    const paths = headingPathsIn("# T\n\n#### Deep\n");

    assert.deepEqual(paths.at(-1).path, "# T > #### Deep");
});

test("a heading with nothing above it stands alone", async () => {
    // Nothing precedes it, so nothing is above it in the path either.
    const { headingPathsIn } = await load();

    assert.deepEqual(headingPathsIn("## A\n\ntext\n"), [
        { line: "## A", path: "## A" }
    ]);
});
