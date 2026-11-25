"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { checkRequiredTools } = require("../../../src/application/setup.js");
const { UserCanceled } = require("../../../src/core/errors.js");
const { failedRun } = require("../../../src/core/outcomes.js");

function fixture({ platform = "darwin", locate, run, sample, checkpoint } = {}) {
    const argv = [], checked = [], opened = [];
    const result = {
        platform, checkpoint: checkpoint ?? (() => undefined),
        locate(name) { checked.push(name); return locate ? locate(name) : { file: `/tools/${name}` }; },
        run(args) {
            argv.push(args);
            if (run) { return run(args); }
            return { status: 0, stdout: args[0].endsWith("pdfcpu") ? "version: v0.16.4" : "1" };
        },
        withSample(inspect) { opened.push(true); return inspect(sample ?? { input: "/form/é.png", output: "/form/output.png", outputExists: () => true }); }
    };
    return { argv, opened, checked, result };
}

test("setup probes every required tool with the real input and flags before passing it to conversion", async () => {
    const { argv, opened, checked, result } = fixture();
    assert.deepEqual(await checkRequiredTools(result), { vips: "/tools/vips", vipsheader: "/tools/vipsheader", pdfcpu: "/tools/pdfcpu" });
    assert.deepEqual(checked, ["vips", "vipsheader", "pdfcpu"]);
    assert.equal(opened.length, 2);
    assert.deepEqual(argv, [
        ["/tools/vips", "thumbnail", "/form/é.png", "/form/output.png", "10", "--size=down", "--export-profile", "srgb", "--fail-on=warning"],
        ["/tools/vipsheader", "-f", "width", "/form/é.png"], ["/tools/pdfcpu", "version"]
    ]);
});

test("missing setup tools are reported together with the selected platform hint", async () => {
    for (const [platform, section] of [["darwin", "macos"], ["linux", "linux"], ["win32", "windows"]]) {
        const { argv, opened, result } = fixture({ platform, locate: () => ({ file: null }) });
        await assert.rejects(() => checkRequiredTools(result), (error) => {
            const outcome = failedRun(error);
            assert.equal(outcome.state, "setup-failed");
            assert.deepEqual(outcome.issues.map(({ code }) => code), ["tool-missing", "tool-missing", "tool-missing", "install-hint"]);
            assert.deepEqual(outcome.issues.slice(0, 3).map(({ params }) => params.name), ["vips", "vipsheader", "pdfcpu"]);
            assert.deepEqual(outcome.issues.slice(0, 3).map(({ params }) => params), [{ name: "vips" }, { name: "vipsheader" }, { name: "pdfcpu" }]);
            assert.deepEqual(outcome.issues[3].params, { platform, packages: ["libvips", "pdfcpu"] });
            assert.equal(outcome.issues[3].message,
                `Install libvips and pdfcpu. See the installation guide (https://github.com/resoltico/ImageFilesToPDF#${section}).`);
            return true;
        });
        assert.deepEqual([argv, opened], [[], []]);
    }
});

test("explicit overrides do not fall back and native stderr stays diagnostic", async () => {
    const { checked, result } = fixture({
        locate: (name) => ({ file: name === "vips" ? null : `/tools/${name}`, override: { variable: `IMAGE_FILES_TO_PDF_${name.toUpperCase()}`, value: `/overrides/${name}` } }),
        run: () => ({ status: 1, stderr: "native diagnostic" })
    });
    await assert.rejects(() => checkRequiredTools(result), (error) => {
        assert.deepEqual(checked, ["vips", "vipsheader", "pdfcpu"]);
        assert.deepEqual(error.issues.map(({ code }) => code), ["override-invalid", "tool-unusable", "tool-unusable"]);
        assert.match(error.issues[0].message, /IMAGE_FILES_TO_PDF_VIPS="\/overrides\/vips"/u);
        assert.equal(error.issues[0].params.value, "/overrides/vips");
        assert.equal(error.issues[1].diagnostic.message, "native diagnostic");
        assert.match(error.issues[2].message, /Version 0\.16\.4 or later is required/u);
        assert.doesNotMatch(error.message, /native diagnostic|installation guide/u);
        return true;
    });
});

test("zero status without the required capability gives a setup problem for each backend", async () => {
    const { result } = fixture({
        run: (args) => args[0].endsWith("pdfcpu") ? { status: 0, error: "Backend failed to settle." } : { status: 0, stdout: "unexpected" },
        sample: { input: "/form/test.png", output: "/form/output.png", outputExists: () => false }
    });
    await assert.rejects(() => checkRequiredTools(result), ({ issues }) => {
        assert.deepEqual(issues.map(({ code }) => code), ["tool-unusable", "tool-unusable", "tool-unusable", "install-hint"]);
        assert.match(issues[2].message, /0\.16\.4/u);
        return true;
    });
});

test("Stop is observed after a native setup probe settles", async () => {
    let settled = false;
    const { result, checked } = fixture({
        async run() { await Promise.resolve(); settled = true; return { status: 1 }; },
        checkpoint() { if (settled) { throw new UserCanceled(); } }
    });
    await assert.rejects(() => checkRequiredTools(result), UserCanceled);
    assert.deepEqual(checked, ["vips"]);
});


test("a platform without its own installation section points to the overview", async () => {
    for (const [platform, guide] of [["freebsd", "#installing-the-tools"], ["linux", "#linux"]]) {
        const { result } = fixture({ platform, locate: () => ({ file: null }) });
        const issues = await checkRequiredTools(result).then(() => assert.fail("setup must fail"), (error) => error.issues);
        assert.deepEqual(issues.map(({ code }) => code), ["tool-missing", "tool-missing", "tool-missing", "install-hint"]);
        assert.deepEqual(issues[3].params, { platform, packages: ["libvips", "pdfcpu"] });
        assert.ok(issues[3].message.endsWith(`ImageFilesToPDF${guide}).`), issues[3].message);
    }
});

test("setup requires status, native error and feature evidence independently", async () => {
    const cases = [
        [{ status: 1, stdout: "1" }, "vipsheader"],
        [{ status: 0, error: "spawn reported an error", stdout: "1" }, "vipsheader"],
        [{ status: 0, stdout: "16" }, "vipsheader"],
        [{ status: 1, stdout: "version: v0.16.4" }, "pdfcpu"]
    ];
    for (const [failed, tool] of cases) {
        const { result } = fixture({
            run: ([program]) => program.endsWith(`/${tool}`) ? failed : { status: 0, stdout: program.endsWith("pdfcpu") ? "version: v0.16.4" : "1" }
        });
        await assert.rejects(() => checkRequiredTools(result), ({ issues }) =>
            issues.length === 2 && issues[0].code === "tool-unusable" && issues[0].params.name === tool &&
            issues[1].code === "install-hint" && issues[1].params.packages[0] === (tool === "pdfcpu" ? "pdfcpu" : "libvips"));
    }
});

test("setup checks Stop before executable discovery", async () => {
    const { result, checked, argv } = fixture({ checkpoint() { throw new UserCanceled(); } });
    await assert.rejects(() => checkRequiredTools(result), UserCanceled);
    assert.deepEqual([checked, argv], [[], []]);
});

test("one missing automatic tool gives one hint for precisely that package", async () => {
    const { result } = fixture({ locate: (name) => ({ file: name === "pdfcpu" ? null : `/tools/${name}` }) });
    await assert.rejects(() => checkRequiredTools(result), ({ issues }) => {
        assert.deepEqual(issues, [
            { code: "tool-missing", stage: "setup", params: { name: "pdfcpu" }, message: "pdfcpu could not be found." },
            { code: "install-hint", stage: "setup", params: { platform: "darwin", packages: ["pdfcpu"] },
                message: "Install pdfcpu. See the installation guide (https://github.com/resoltico/ImageFilesToPDF#macos)." }
        ]);
        return true;
    });
});

test("vips is judged by its output file and vipsheader by its answer", async () => {
    // vips prints nothing useful; only the file it writes shows it worked.
    const answers = { pdfcpu: "version: v0.16.4", vipsheader: "1", vips: "" };
    const quietVips = fixture({ run: (args) => ({ status: 0, stdout: answers[args[0].split("/").pop()] }) });
    assert.equal((await checkRequiredTools(quietVips.result)).vips, "/tools/vips");
    const wrongAnswer = fixture({ run: (args) => ({ status: 0, stdout: args[0].endsWith("pdfcpu") ? "version: v0.16.4" : "2" }) });
    await assert.rejects(() => checkRequiredTools(wrongAnswer.result), (error) => {
        assert.deepEqual(failedRun(error).issues.map(({ params }) => params.name).filter(Boolean), ["vipsheader"]);
        return true;
    });
});

test("a Stop checkpoint follows every capability probe", async () => {
    const events = [];
    const { result } = fixture({
        locate(name) { events.push(`locate ${name}`); return { file: `/tools/${name}` }; },
        run(args) { events.push(`probe ${args[0].split("/").pop()}`); return { status: 0, stdout: args[0].endsWith("pdfcpu") ? "version: v0.16.4" : "1" }; },
        checkpoint() { events.push("checkpoint"); }
    });
    await checkRequiredTools(result);
    assert.deepEqual(events, ["checkpoint", "locate vips", "probe vips", "checkpoint", "checkpoint", "locate vipsheader", "probe vipsheader", "checkpoint",
        "checkpoint", "locate pdfcpu", "probe pdfcpu", "checkpoint"]);
});
