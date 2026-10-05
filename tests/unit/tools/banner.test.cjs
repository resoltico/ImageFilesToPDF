"use strict";

/*
 * The artifact leaves the repository, so its header is the only place it can
 * say what it is, whose it is, and where it came from. Everything in it is
 * quoted from a file that already states it, and this is where that is held to.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/banner.mjs");

const FILES = {
    "package.json": JSON.stringify({
        version: "9.9.9",
        license: "MPL-2.0",
        copyright: "2026 Someone",
        homepage: "https://github.com/someone/Project"
    })
};

const read = (relative) => Promise.resolve(FILES[relative]);

test("the banner is quoted from the repository, not retyped", async () => {
    const { readMetadata, renderBanner } = await load();
    const banner = renderBanner(await readMetadata(read, "12.3"));

    assert.match(banner, /Image Files to PDF 9\.9\.9/u);
    assert.match(banner, /https:\/\/github\.com\/someone\/Project/u);
    assert.match(banner, /Copyright \(c\) 2026 Someone/u);
    assert.match(banner, /SPDX-License-Identifier: MPL-2\.0/u);
    assert.match(banner, /This Source Code Form is subject to the terms/u);
    assert.match(banner, /https:\/\/mozilla\.org\/MPL\/2\.0\//u);
    assert.match(banner, /Source Code Form: https:\/\/github\.com\/someone\/Project\/tree\/v9\.9\.9/u);
    assert.match(banner, /Requires macOS 12\.3 or later/u);
});

test("the banner is a comment, and the only one before the code", async () => {
    // The stripper keeps the first comment and nothing else before the code,
    // so a banner that is not one comment would lose part of itself.
    const { readMetadata, renderBanner } = await load();
    const banner = renderBanner(await readMetadata(read, "12.3"));

    assert.match(banner, /^\/\*/u);
    assert.match(banner, /\*\/$/u);
    assert.equal(banner.slice(2, -2).includes("*/"), false, "one comment, not two");
});

test("it says the comments were stripped and where they went", async () => {
    // Otherwise the file looks like a codebase with no explanations in it.
    const { readMetadata, renderBanner } = await load();
    const banner = renderBanner(await readMetadata(read, "12.3"));

    assert.match(banner, /Comments are stripped on build/u);
    assert.match(banner, /Generated file\. Edit the sources and rebuild/u);
});

test("missing or invalid copyright metadata is refused", async () => {
    const { readMetadata } = await load();

    await Promise.all([undefined, 2026, "", "   "].map((copyright) =>
        assert.rejects(
            () => readMetadata(() => Promise.resolve(JSON.stringify({copyright})), "12.3"),
            /package.json no longer carries a copyright notice/u
        )));
});

test("the copyright notice is preserved with outer whitespace removed", async () => {
    const { readMetadata } = await load();
    const metadata = await readMetadata(() => Promise.resolve(JSON.stringify({
        copyright: "  2019-2026 A. Person and others  "
    })), "12.3");

    assert.equal(metadata.copyright, "2019-2026 A. Person and others");
});
