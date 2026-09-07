"use strict";

/*
 * Setting aside a PDF that could not be published.
 *
 * It has been imported and validated by the time this runs, and the workspace
 * it sits in is removed as soon as the run ends — so where it goes is the
 * difference between a recoverable failure and lost work.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { setAside } = require("../../../src/runtime/rescue.js");
const { createFakeHost } = require("./fake-host.cjs");

const RECOVERY = "/var/folders/xx/T/ImageFilesToPDF-recovered.Fake01";

test("the PDF is moved out of the workspace, keeping its name", () => {
    const host = createFakeHost({ files: ["/tmp/ws/output_20260906.pdf"] });
    const recovered = setAside(host, "/tmp/ws/output_20260906.pdf");

    assert.match(recovered, /output_20260906\.pdf$/u, recovered);
    assert.ok(host.files.has(recovered), "it must exist where it was put");
    assert.ok(!host.files.has("/tmp/ws/output_20260906.pdf"), "and not where it was");
});

test("the folder it goes to is made for the purpose", () => {
    const host = createFakeHost({ files: ["/tmp/ws/a.pdf"] });

    setAside(host, "/tmp/ws/a.pdf");

    const made = host.commands.find((command) => command.includes("mktemp"));

    assert.match(made, /'-d'/u, "a directory, not a file");
    assert.match(made, /ImageFilesToPDF-recovered/u, "named so it can be found");
});

test("a PDF that cannot be moved stays where it was, and says so", () => {
    // Best effort. Claiming a rescue that did not happen would send someone
    // to a folder with nothing in it.
    const host = createFakeHost({
        files: ["/tmp/ws/a.pdf"],
        failures: [["/bin/mv", new Error("Operation not permitted")]]
    });

    assert.equal(setAside(host, "/tmp/ws/a.pdf"), "/tmp/ws/a.pdf");
    assert.ok(host.files.has("/tmp/ws/a.pdf"), "and it is still there");
});

test("a folder that cannot be made leaves the PDF where it was", () => {
    const host = createFakeHost({
        files: ["/tmp/ws/a.pdf"],
        failures: [["mktemp", new Error("no space left")]]
    });

    assert.equal(setAside(host, "/tmp/ws/a.pdf"), "/tmp/ws/a.pdf");
});

test("the prefix is passed as a prefix, not as a template", () => {
    // Without -t, mktemp reads the argument as a template and requires the
    // trailing X's; the folder is never made and the rescue never happens.
    const host = createFakeHost({ files: ["/tmp/ws/a.pdf"] });

    setAside(host, "/tmp/ws/a.pdf");

    assert.equal(
        host.commands.find((command) => command.includes("mktemp")),
        "'/usr/bin/mktemp' '-d' '-t' 'ImageFilesToPDF-recovered'"
    );
});

test("a host that answers with something other than a string still works", () => {
    // doShellScript answers through the ObjC bridge, and what comes back is
    // not always a JavaScript string. Trimming it directly would throw, and
    // the rescue would silently become a no-op.
    const host = createFakeHost({ files: ["/tmp/ws/a.pdf"] });
    const { doShellScript } = host;

    host.doShellScript = (command) => ({
        toString: () => doShellScript(command)
    });

    assert.equal(
        setAside(host, "/tmp/ws/a.pdf"),
        `${RECOVERY}/a.pdf`
    );
});
