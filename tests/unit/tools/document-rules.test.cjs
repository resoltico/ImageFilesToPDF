"use strict";

/*
 * The documents were the one part of this repository nothing read, and one of
 * them was carrying its own opening twice. Each guard is asserted to reject
 * what it exists to reject, and to let through what it must.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/lint/document-rules.mjs");

const GOOD = "# Title\n\n## One\n\ntext\n\n## Two\n\nmore\n";

test("a well-formed document passes", async () => {
    const { checkDocument } = await load();

    assert.doesNotThrow(() => checkDocument("README.md", GOOD));
});

test("a section repeated in the same place is refused", async () => {
    // The shape a splice takes: a document that contains part of itself twice
    // reads as if it has two of the same section.
    const { checkDocument } = await load();

    assert.throws(
        () => checkDocument("CONTRIBUTING.md", `${GOOD}\n## One\n\nagain\n`),
        (error) => {
            assert.equal(error.message, "CONTRIBUTING.md: repeats ## One in " +
                "the same place; two sections cannot be the same section, and " +
                "text spliced into a document is how that happens");

            return true;
        }
    );
    assert.throws(
        () => checkDocument("a.md", "# T\n\n## One\n\n### Same\n\n### Same\n"),
        /repeats ### Same in the same place/u
    );
});

test("the same subheading under different sections is not a repeat", async () => {
    // Keep a Changelog puts "### Fixed" under every release that fixed
    // something. Comparing headings whole would refuse the second release --
    // a gate that blocks the next change is one somebody weakens.
    const { checkDocument } = await load();

    assert.doesNotThrow(() => checkDocument("CHANGELOG.md", [
        "# Changelog",
        "",
        "## [1.2.0]",
        "",
        "### Fixed",
        "",
        "## [1.1.0]",
        "",
        "### Fixed",
        ""
    ].join("\n")));
});

test("a document has exactly one title, and opens with it", async () => {
    const { checkDocument } = await load();

    assert.throws(
        () => checkDocument("a.md", "# One\n\n# Two\n"),
        (error) => {
            assert.equal(error.message, "a.md: has 2 top-level headings; a " +
                "document is one document and says so once");

            return true;
        }
    );
    assert.throws(
        () => checkDocument("a.md", "## Section\n\n# Title\n"),
        /opens with ## Section before its title/u
    );
    assert.throws(
        () => checkDocument("a.md", "## Section\n\ntext\n"),
        /has 0 top-level headings/u
    );
});

test("a Markdown file with no headings is not a document", async () => {
    // Otherwise every rule above passes over it silently.
    const { checkDocument } = await load();

    assert.throws(() => checkDocument("a.md", "just prose\n"), /has no headings/u);
});

test("a hash that is not a heading is not counted as one", async () => {
    // A heading starts its line. Prose that mentions one, and a hash with no
    // space after it, are text -- and reading either as a heading would refuse
    // a document for saying something perfectly ordinary.
    const { checkDocument } = await load();

    assert.doesNotThrow(
        () => checkDocument("a.md", "# Title\n\n#not a heading\n\n#\n")
    );
    assert.doesNotThrow(
        () => checkDocument("a.md", "See # Title below.\n\n# Title\n\n## One\n")
    );
});

test("a shipped document that is not Markdown is held to the hygiene only", async () => {
    // INSTALL.txt is deliberately plain text and underlines its headings, so
    // it has none to check -- but it goes out with the release, and a splice
    // into it would be just as invisible.
    const { checkDocument } = await load();

    assert.doesNotThrow(
        () => checkDocument("INSTALL.txt", "IMAGE FILES TO PDF\n==================\n")
    );
    assert.throws(
        () => checkDocument("INSTALL.txt", "text \n"),
        /INSTALL\.txt: has trailing whitespace/u
    );
});

test("the same hygiene the source files are held to", async () => {
    const { checkDocument } = await load();

    assert.throws(() => checkDocument("a.md", "# T\n\ntext \n"), /trailing whitespace/u);
    assert.throws(() => checkDocument("a.md", "# T\r\n"), /carriage return/u);
    assert.throws(() => checkDocument("a.md", "# T\n\ntext"), /does not end with a newline/u);
});
