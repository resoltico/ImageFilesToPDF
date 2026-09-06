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
        license: "MIT",
        homepage: "https://github.com/someone/Project"
    }),
    LICENSE: "MIT License\n\nCopyright (c) 2026 Someone\n\nPermission is...\n"
};

const read = (relative) => Promise.resolve(FILES[relative]);

test("the banner is quoted from the repository, not retyped", async () => {
    const { readMetadata, renderBanner } = await load();
    const banner = renderBanner(await readMetadata(read, "12.3"));

    assert.match(banner, /Image Files to PDF 9\.9\.9/u);
    assert.match(banner, /https:\/\/github\.com\/someone\/Project/u);
    assert.match(banner, /Copyright \(c\) 2026 Someone/u);
    assert.match(banner, /SPDX-License-Identifier: MIT/u);
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

test("a LICENSE that stops naming a holder is an error, not a blank", async () => {
    const { readMetadata } = await load();

    await assert.rejects(
        () => readMetadata(
            (relative) => Promise.resolve(
                relative === "LICENSE" ? "MIT License\n" : FILES[relative]
            ),
            "12.3"
        ),
        /LICENSE no longer carries a copyright line/u
    );
});

test("the copyright is taken whole, however it is worded", async () => {
    const { copyrightFrom } = await load();

    assert.equal(
        copyrightFrom("MIT License\n\nCopyright (c) 2019-2026 A. Person and others  \n"),
        "2019-2026 A. Person and others"
    );
});

test("the notice line is taken, not a sentence that mentions it", async () => {
    // The line stands on its own; prose about it does not, and quoting the
    // prose would put half a sentence in the header of every copy shipped.
    const { copyrightFrom } = await load();

    assert.equal(
        copyrightFrom([
            "MIT License",
            "",
            "Retain the Copyright (c) notice in every copy.",
            "",
            "Copyright (c) 2026 Someone",
            ""
        ].join("\n")),
        "2026 Someone"
    );
});
