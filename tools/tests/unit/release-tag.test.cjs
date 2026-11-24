"use strict";

/*
 * The check that runs before anything is published under a tag.
 *
 * A tag is a claim about which version is being released, and it is the one
 * claim nothing else in the repository can contradict on its own: the files
 * can all agree with each other and still disagree with the tag.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { fakeRepo, loadConsistency } = require("./fake-repo.cjs");

test("a release tag must name the version the repository agrees on", async () => {
    const { checkReleaseTag } = await loadConsistency();

    assert.equal(await checkReleaseTag("v1.2.3", fakeRepo()), "1.2.3");
});

test("a tag for another version is refused", async () => {
    const { checkReleaseTag } = await loadConsistency();

    await assert.rejects(
        () => checkReleaseTag("v1.2.4", fakeRepo()),
        /release tag v1\.2\.4 does not match the declared version: expected v1\.2\.3/u
    );
});

test("the v prefix is part of the tag, not decoration", async () => {
    const { checkReleaseTag } = await loadConsistency();

    const refused = ["1.2.3", "V1.2.3", "v1.2.3-rc1", "release-1.2.3", ""];

    await Promise.all(refused.map((tag) => assert.rejects(
        () => checkReleaseTag(tag, fakeRepo()),
        /does not match the declared version/u,
        `${JSON.stringify(tag)} must be refused`
    )));
});

test("a tag cannot be checked while the version files disagree", async () => {
    // The tag is compared against the agreed version, so tagging cannot
    // paper over a repository that states two different versions.
    const { checkReleaseTag } = await loadConsistency();

    await assert.rejects(
        () => checkReleaseTag("v1.2.3", fakeRepo({
            "INSTALL.txt": "IMAGE FILES TO PDF 9.9.9 - SHORTCUTS INSTALLATION"
        })),
        /versions disagree/u
    );
});
