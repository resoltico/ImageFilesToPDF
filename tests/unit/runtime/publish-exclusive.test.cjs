"use strict";

/*
 * Publishing from beside the destination.
 *
 * Two operations create a name whole, and which one works is the volume's
 * business. Measured, from a place beside the destination: APFS and HFS Plus
 * take a hard link, FAT32 has none and takes an exclusive rename, exFAT takes
 * neither. So the link is tried first -- it needs no bridge, and a volume
 * that has links must not be refused because a bridge is missing -- and the
 * rename is what a camera card is published by.
 *
 * The rename is measured through the bridge too: a free name is taken, an
 * occupied one, a folder and a link whose target is gone are refused with
 * what is there left exactly as it was, and the file keeps the number that
 * identifies it, so the publication can still be proved afterwards.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const DENIED = "Operation not permitted";
const DIRECT_CLAIM = "ln' '/a/p.pdf'";

// Another volume: the workspace is elsewhere, so the claim from it is
// refused, and the copy beside the destination can still be linked into
// place. An attached APFS or HFS Plus drive is this.
function otherVolume(settings) {
    return createFakeHost({
        ...settings,
        failures: [[DIRECT_CLAIM, new Error(DENIED)], ...settings.failures ?? []]
    });
}

// A volume with no hard links at all, which is what FAT32 measurably is: no
// claim of ours can be a link, wherever it is made from.
function linkless(settings) {
    return createFakeHost({
        ...settings,
        failures: [["/bin/ln", new Error("Operation not supported")],
            ...settings.failures ?? []]
    });
}

// What the run has to reach the exclusive rename through, counted, so a
// publication can be shown to have gone without it.
function countingRenamer(host) {
    const calls = [];

    return {
        calls,
        rename(from, to) {
            calls.push(to);

            return host.renamer.rename(from, to);
        }
    };
}

test("where a link cannot be made, one rename publishes", () => {
    const host = linkless({ files: ["/a/p.pdf"] });

    publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf");

    assert.ok(host.files.has("/a/out.pdf"));
    assert.deepEqual(
        host.commands.filter((command) => command.includes("'/a/out.pdf'") &&
            /\/bin\/(?:cp|mv|rm)/u.test(command)),
        [],
        "and nothing wrote to the output name on the way there"
    );
});

test("a volume that has links is published to without the rename", () => {
    // The bridge to the rename is a thing that can be missing, and a drive
    // with hard links has no need of it: the copy beside the destination is
    // linked into place from there. When the rename was the only thing tried
    // from that place, a volume that could take a link was refused instead.
    const host = otherVolume({ files: ["/a/p.pdf"] });
    const job = makeJob(host);
    const renamer = countingRenamer(host);

    job.rename = renamer;
    publishPdf(job, "/a/p.pdf", "/a/out.pdf");

    assert.ok(host.files.has("/a/out.pdf"), "the PDF is at its name");
    assert.deepEqual(renamer.calls, [], "and the rename was never reached for");
});

test("a volume that has links publishes with no bridge at all", () => {
    const host = otherVolume({ files: ["/a/p.pdf"] });
    const job = makeJob(host);

    job.rename = null;
    publishPdf(job, "/a/p.pdf", "/a/out.pdf");

    assert.ok(host.files.has("/a/out.pdf"));
    assert.deepEqual(
        [...host.files].filter((file) => file.includes(".ImageFilesToPDF")),
        [],
        "and the place it was copied into is cleared away"
    );
});

test("the copy is moved out of the place it was made in, which then goes", () => {
    const host = linkless({ files: ["/a/p.pdf"] });

    publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf");

    assert.deepEqual(
        [...host.files].filter((file) => file.includes(".ImageFilesToPDF")),
        [],
        "nothing of the run is left in the folder"
    );
    assert.match(
        host.commands.at(-2),
        /'\/bin\/rmdir' '\/a\/\.ImageFilesToPDF-[^']+'/u,
        "the place is cleared away"
    );
});
