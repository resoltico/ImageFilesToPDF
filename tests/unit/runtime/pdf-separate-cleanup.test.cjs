"use strict";

/*
 * What one separate-mode attempt leaves behind, and what it says about itself.
 *
 * Two things that were wrong in the same function. The page JPEG outlived the
 * PDF that needed it, so scratch storage grew with every image converted
 * rather than staying at one. And the failure a person read named the file
 * twice -- the work was wrapped in withImageName, which prefixes the message,
 * and the record carries the name beside it.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createSeparatePdfs
} = require("../../../src/runtime/pdf-separate.js");
const { completionMessage } = require("../../../src/runtime/completion.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");

const PAGES = /-page\.jpg$/u;

function pagesLeft(host) {
    return [...host.files].filter((path) => PAGES.test(path));
}

function brokenAt(paths, stage) {
    return paths.map((path) => [path, (command) => (
        command.includes(stage) ? new Error("premature end of JPEG image") : undefined
    )]);
}

test("each attempt takes its page with it", () => {
    // A separate run needs one page at a time. It used to keep all of them
    // until the workspace went at the end of the batch, so a long run held
    // every page it had ever made.
    const paths = ["/a/1.png", "/a/2.png", "/a/3.png"];
    const host = createFakeHost({ files: paths });
    const results = createSeparatePdfs(makeJob(host), paths.map(imageOf));

    assert.equal(results.outputs.length, paths.length);
    assert.deepEqual(pagesLeft(host), [], "no page outlived its PDF");
});

test("a failed attempt takes its page too", () => {
    // Failed after the page was written rather than before it, so there is
    // something left to clean up: the page for the second image exists by the
    // time pdfcpu is asked to import it.
    const paths = ["/a/1.png", "/a/2.png"];
    const host = createFakeHost({
        files: paths,
        failures: [["000002-page.jpg", (command) => (
            command.includes("'import'")
                ? new Error("pdfcpu would not take it")
                : undefined
        )]]
    });
    const results = createSeparatePdfs(makeJob(host), paths.map(imageOf));

    assert.equal(results.failures.length, 1);
    assert.deepEqual(pagesLeft(host), []);
});

test("a failure names the file once", () => {
    const host = createFakeHost({
        files: ["/a/photo.png"],
        failures: brokenAt(["/a/photo.png"], "thumbnail")
    });
    const results = createSeparatePdfs(makeJob(host), [imageOf("/a/photo.png")]);
    const [failure] = results.failures;

    assert.equal(failure.name, "photo.png");
    assert.ok(
        !failure.message.startsWith("photo.png:"),
        `the record carries the name; the message must not repeat it: ${failure.message}`
    );

    results.elapsed = "1 second(s)";
    results.rejected = [];

    assert.ok(
        !completionMessage("separate", results, 1).includes("photo.png: photo.png:"),
        "and what a person reads says it once"
    );
});

test("a failure still carries the command that failed", () => {
    // Reached through the cause chain, and the chain is one link shorter now.
    const host = createFakeHost({
        files: ["/a/photo.png"],
        failures: brokenAt(["/a/photo.png"], "thumbnail")
    });
    const results = createSeparatePdfs(makeJob(host), [imageOf("/a/photo.png")]);

    assert.match(results.failures[0].command, /thumbnail/u);
});
