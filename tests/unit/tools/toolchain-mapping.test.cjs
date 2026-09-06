"use strict";

/*
 * Which formula provides each command the integration suite requires, and
 * what happens when that is left blank.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/lint/toolchain.mjs");

test("a blank mapping is refused, not read as preinstalled", async () => {
    // The two are represented differently on purpose. Were a blank mapping
    // read as "ships with macOS", leaving one empty would exempt that tool
    // from the check without a word — which is how tiffcp came to be required
    // by the suite and installed by nothing.
    const { formulaFor } = await load();

    assert.throws(
        () => formulaFor("tiffcp", { tiffcp: "" }),
        /mapped to no formula; if it ships with macOS it belongs in PREINSTALLED/u
    );
    assert.equal(formulaFor("tiffcp", { tiffcp: "libtiff" }), "libtiff");
});

test("no command in the real table is mapped to nothing", async () => {
    const { formulaFor } = await load();
    const tools = [
        "vips", "vipsheader", "pdfcpu", "qpdf", "pdfinfo", "pdftoppm", "tiffcp"
    ];

    for (const tool of tools) {
        assert.ok(formulaFor(tool).length > 0, `${tool} must name a formula`);
    }
});

test("the copies may differ in trailing whitespace and still agree", async () => {
    // A stray space at the end of one line is not a different command, and
    // reporting it as a disagreement would send someone hunting a difference
    // they cannot see.
    const { checkToolchain } = await load();
    const files = {
        "CONTRIBUTING.md": "```sh\nbrew install vips libtiff\n```\n",
        ".github/workflows/quality.yml": "      - run: brew install vips libtiff  \n",
        ".github/workflows/release.yml": "      - run: brew install vips libtiff\n",
        "tests/integration/lib/fixtures.sh": "    for tool in vips tiffcp; do\n"
    };

    assert.equal(
        await checkToolchain((file) => Promise.resolve(files[file])),
        2
    );
});

test("a disagreement names the file and which occurrence in it", async () => {
    const { checkToolchain } = await load();
    const files = {
        "CONTRIBUTING.md": "brew install vips libtiff\nbrew install vips\n",
        ".github/workflows/quality.yml": "brew install vips libtiff\n",
        ".github/workflows/release.yml": "brew install vips libtiff\n",
        "tests/integration/lib/fixtures.sh": "    for tool in vips tiffcp; do\n"
    };

    await assert.rejects(
        () => checkToolchain((file) => Promise.resolve(files[file])),
        (error) => {
            assert.match(error.message, /CONTRIBUTING\.md \(1\)/u);
            assert.match(error.message, /CONTRIBUTING\.md \(2\)/u);

            return true;
        }
    );
});
