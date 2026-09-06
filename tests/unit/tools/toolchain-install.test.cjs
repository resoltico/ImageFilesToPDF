"use strict";

/*
 * The install command itself: the four copies of it must agree, and must
 * still be there to compare.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/lint/toolchain.mjs");

test("the copies of the install command must agree", async () => {
    const { checkToolchain } = await load();
    const files = {
        "CONTRIBUTING.md": "```sh\nbrew install vips libtiff\n```\n",
        ".github/workflows/quality.yml": "      - run: brew install vips libtiff\n",
        ".github/workflows/release.yml": "      - run: brew install vips\n",
        "tests/integration/lib/fixtures.sh": "    for tool in vips tiffcp; do\n"
    };

    await assert.rejects(
        () => checkToolchain((file) => Promise.resolve(files[file])),
        /install commands disagree between files/u
    );
});

test("an install command that has gone missing is not silently zero tools", async () => {
    const { checkToolchain } = await load();

    await assert.rejects(
        () => checkToolchain((file) => Promise.resolve(
            file === "CONTRIBUTING.md" ? "no command here\n" : "brew install vips\n"
        )),
        /CONTRIBUTING\.md no longer documents the install command/u
    );
});

test("a fixtures file that stops listing its tools is an error", async () => {
    const { checkToolchain } = await load();
    const agreed = "brew install vips\n";

    await assert.rejects(
        () => checkToolchain((file) => Promise.resolve(
            file.endsWith("fixtures.sh") ? "nothing listed\n" : agreed
        )),
        /no longer lists its required tools/u
    );
});

test("an agreeing, complete toolchain reports how many formulae it names", async () => {
    const { checkToolchain } = await load();
    const agreed = "brew install vips libtiff\n";

    assert.equal(
        await checkToolchain((file) => Promise.resolve(
            file.endsWith("fixtures.sh")
                ? "    for tool in osascript vips tiffcp; do\n"
                : agreed
        )),
        2
    );
});

test("a suite that needs a formula nobody installs fails the gate", async () => {
    // The whole reason this check exists: tiffcp was required and installed
    // by nothing, and the suite passed anyway because vips pulls in libtiff.
    const { checkToolchain } = await load();
    const agreed = "brew install vips pdfcpu\n";

    await assert.rejects(
        () => checkToolchain((file) => Promise.resolve(
            file.endsWith("fixtures.sh")
                ? "    for tool in vips pdfcpu tiffcp pdfinfo; do\n"
                : agreed
        )),
        (error) => {
            assert.match(
                error.message,
                /requires tools the documented install does not provide/u
            );
            // Named once each, however many commands come from them.
            assert.match(error.message, /libtiff/u);
            assert.match(error.message, /poppler/u);

            return true;
        }
    );
});
