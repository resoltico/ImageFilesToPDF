"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createCombinedPdf,
    createSeparatePdfs
} = require("../../../src/runtime/pdf.js");
const { failing } = require("./fake-app.cjs");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");

const images = [imageOf("/a/x.png")];

test("createCombinedPdf produces one output beside the first image", () => {
    const app = createFakeHost({ files: ["/a/x.png"] });
    const result = createCombinedPdf(makeJob(app), images);

    assert.deepEqual(result.failures, []);
    assert.equal(result.outputs[0], "/a/output_20260904_010203.pdf");
});

test("createCombinedPdf removes the partial file when a stage fails", () => {
    const app = createFakeHost({
        files: ["/a/x.png"],
        failures: [["'import'", failing("pdfcpu died")]]
    });

    assert.throws(() => createCombinedPdf(makeJob(app), images), /creating PDF/u);
    assert.ok(
        ![...app.files].some((file) => file.includes("staged")),
        "no staged file may be left behind"
    );

    // The import never got far enough to create the file, so its absence
    // alone proves nothing. The removal is visible as the last thing the run
    // did before giving up.
    const removals = app.commands.filter(
        (command) => command.includes("/bin/rm") && command.includes("staged")
    );

    assert.equal(removals.length, 2, "cleared before the build, and after it failed");
    assert.match(app.commands.at(-1), /'\/bin\/rm'/u);
});

test("nothing but the finished PDF is ever written into the output folder", () => {
    // The whole point of building in the workspace. A file pdfcpu wrote into
    // the user's Downloads folder could afterwards be neither renamed nor
    // read by the Shortcuts helper, which failed every run.
    const app = createFakeHost({ files: ["/a/x.png"] });

    createCombinedPdf(makeJob(app), images);

    const inOutputFolder = [...app.files]
        .filter((file) => file.startsWith("/a/"))
        .sort();

    assert.deepEqual(inOutputFolder, ["/a/output_20260904_010203.pdf", "/a/x.png"]);
});

test("a failed run leaves the output folder exactly as it found it", () => {
    const app = createFakeHost({
        files: ["/a/x.png"],
        failures: [["'import'", failing("pdfcpu died")]]
    });

    assert.throws(() => createCombinedPdf(makeJob(app), images));
    assert.deepEqual(
        [...app.files].filter((name) => name.startsWith("/a/")),
        ["/a/x.png"],
        "the workspace may hold debris; the user's folder may not"
    );
});

test("createCombinedPdf steps aside rather than overwrite an earlier run", () => {
    // Two runs in the same second land on the same name. The second must not
    // replace the first one's PDF.
    const app = createFakeHost({
        files: ["/a/x.png", "/a/output_20260904_010203.pdf"]
    });
    const result = createCombinedPdf(makeJob(app), images);

    assert.equal(result.outputs[0], "/a/output_20260904_010203_2.pdf");
    assert.ok(
        app.files.has("/a/output_20260904_010203.pdf"),
        "the earlier PDF must survive untouched"
    );
});

test("createSeparatePdfs continues past a failing image", () => {
    const app = createFakeHost({
        files: ["/a/good.png", "/a/bad.png"],
        failures: [["'/a/bad.png'", failing("unreadable")]]
    });
    const files = [
        imageOf("/a/good.png"),
        imageOf("/a/bad.png")
    ];
    const result = createSeparatePdfs(makeJob(app), files);

    assert.equal(result.outputs.length, 1);
    assert.match(result.outputs[0], /good_20260904_010203\.pdf$/u);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].name, "bad.png");
    // The command that failed travels with the failure, for the log.
    assert.match(result.failures[0].command, /vipsheader/u);

    // The failing image's staged file is removed on the way out, and nothing
    // of it is left in the folder the images came from.
    assert.ok(
        app.commands.some(
            (command) => command.includes("/bin/rm") && command.includes("staged")
        ),
        "the failed image's staged file must be removed"
    );
    assert.deepEqual(
        [...app.files].filter((file) => file.startsWith("/a/")).sort(),
        ["/a/bad.png", "/a/good.png", "/a/good_20260904_010203.pdf"]
    );
});
