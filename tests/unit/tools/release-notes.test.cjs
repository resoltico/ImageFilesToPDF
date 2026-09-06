"use strict";

/*
 * The CHANGELOG section that becomes a release body.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { fakeRepo } = require("./fake-repo.cjs");

const loadNotes = () => import("../../../tools/lint/notes.mjs");

test("the release notes are the CHANGELOG section for that version", async () => {
    const { releaseNotes } = await loadNotes();
    const notes = await releaseNotes("1.2.3", fakeRepo({
        "CHANGELOG.md": "# Changelog\n\n## [1.2.3] - 2026-01-01\n\nWhat changed.\n"
            + "\n## [1.2.2] - 2025-12-01\n\nOlder news.\n"
    }));

    assert.equal(notes, "## [1.2.3] - 2026-01-01\n\nWhat changed.");
    assert.ok(!notes.includes("Older news"), "the previous release is not ours");
});

test("the newest section stops where the next one starts, not at the file end", async () => {
    const { releaseNotes } = await loadNotes();
    const notes = await releaseNotes("2.0.0", fakeRepo({
        "CHANGELOG.md": "# Changelog\n\n## [2.0.0] - 2026-02-02\n\nOne.\n\n"
            + "### A subheading\n\nStill ours.\n\n## [1.9.0] - 2026-01-01\n\nTwo.\n"
    }));

    assert.ok(notes.includes("Still ours"), "subheadings belong to the section");
    assert.ok(!notes.includes("Two."), "the next release does not");
});

test("the last section in the file runs to the end", async () => {
    const { releaseNotes } = await loadNotes();
    const notes = await releaseNotes("1.0.0", fakeRepo({
        "CHANGELOG.md": "# Changelog\n\n## [1.0.0] - 2026-01-01\n\nFirst release.\n"
    }));

    assert.equal(notes, "## [1.0.0] - 2026-01-01\n\nFirst release.");
});

test("a version with no section is refused rather than published empty", async () => {
    const { releaseNotes } = await loadNotes();

    await assert.rejects(
        () => releaseNotes("9.9.9", fakeRepo()),
        /CHANGELOG\.md has no section for 9\.9\.9/u
    );
});

test("a version is not matched by a longer one that starts the same way", async () => {
    // "## [1.2.30]" must not be taken for the notes of 1.2.3.
    const { releaseNotes } = await loadNotes();

    await assert.rejects(
        () => releaseNotes("1.2.3", fakeRepo({
            "CHANGELOG.md": "# Changelog\n\n## [1.2.30] - 2026-01-01\n\nOther.\n"
        })),
        /no section for 1\.2\.3/u
    );
});

test("a version is matched literally, not as a pattern", async () => {
    // The dots in a version are regex wildcards. This was a real defect: the
    // heading was built into a regex and the escaping was silently a no-op,
    // so "1.2.3" accepted the section headed "## [1]x2y3".
    const { releaseNotes } = await loadNotes();

    await assert.rejects(
        () => releaseNotes("1.2.3", fakeRepo({
            "CHANGELOG.md": "# Changelog\n\n## [1]x2y3 - 2026-01-01\n\nNot ours.\n"
        })),
        /no section for 1\.2\.3/u
    );
});

test("a heading must be the version and nothing appended to it", async () => {
    const { releaseNotes } = await loadNotes();
    const refused = ["## [1.2.3]x - 2026-01-01", "## [1.2.34]", "##1.2.3", "### 1.2.3"];

    await Promise.all(refused.map((heading) => assert.rejects(
        () => releaseNotes("1.2.3", fakeRepo({
            "CHANGELOG.md": `# Changelog\n\n${heading}\n\nNo.\n`
        })),
        /no section for 1\.2\.3/u,
        `${heading} must not be taken for the 1.2.3 section`
    )));
});

test("a heading that is the bare version still counts", async () => {
    // "## [1.2.3]" with no date after it is a heading for 1.2.3.
    const { releaseNotes } = await loadNotes();

    assert.equal(
        await releaseNotes("1.2.3", fakeRepo({
            "CHANGELOG.md": "# Changelog\n\n## [1.2.3]\n\nTerse.\n"
        })),
        "## [1.2.3]\n\nTerse."
    );
});

test("a heading on the very first line is still found", async () => {
    // A CHANGELOG need not open with a title. Treating position zero as
    // "not found" would refuse to release a file that starts with its
    // newest section.
    const { releaseNotes } = await loadNotes();

    assert.equal(
        await releaseNotes("1.2.3", fakeRepo({
            "CHANGELOG.md": "## [1.2.3] - 2026-01-01\n\nOnly release.\n"
        })),
        "## [1.2.3] - 2026-01-01\n\nOnly release."
    );
});

test("a section with nothing in it does not swallow the ones below", async () => {
    // The next heading can be the very next line. Treating that as "no
    // following heading" would put every earlier release into these notes.
    const { releaseNotes } = await loadNotes();
    const notes = await releaseNotes("2.0.0", fakeRepo({
        "CHANGELOG.md": "# Changelog\n\n## [2.0.0]\n## [1.9.0]\n\nOld news.\n"
    }));

    assert.equal(notes, "## [2.0.0]");
    assert.ok(!notes.includes("1.9.0"), "the release below is not ours");
    assert.ok(!notes.includes("Old news"));
});
