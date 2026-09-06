"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { checkTools } = require("../../../src/runtime/preflight.js");
const { createFakeHost } = require("./fake-host.cjs");

const ALL_TOOLS = [
    "/opt/homebrew/bin/vips",
    "/opt/homebrew/bin/vipsheader",
    "/opt/homebrew/bin/pdfcpu"
];

test("a healthy machine yields the located tools", () => {
    const host = createFakeHost({});

    assert.deepEqual(checkTools(host), {
        vips: "/opt/homebrew/bin/vips",
        vipsheader: "/opt/homebrew/bin/vipsheader",
        pdfcpu: "/opt/homebrew/bin/pdfcpu"
    });
});

test("the checks run before anything is asked of the user", () => {
    const host = createFakeHost({ executables: [] });

    assert.throws(() => checkTools(host), /Setup needed/u);
    assert.equal(host.dialogs.length, 0, "no dialog was shown");
    assert.equal(host.listPrompts.length, 0, "nothing was asked");
});

test("every missing tool is named in one message", () => {
    const host = createFakeHost({ executables: [] });

    assert.throws(() => checkTools(host), (error) => {
        assert.match(error.message, /vips is not installed/u);
        assert.match(error.message, /vipsheader is not installed/u);
        assert.match(error.message, /pdfcpu is not installed/u);

        return true;
    });
});

test("one missing tool does not hide the others being fine", () => {
    const host = createFakeHost({
        executables: ALL_TOOLS.filter((tool) => !tool.endsWith("pdfcpu"))
    });

    assert.throws(() => checkTools(host), (error) => {
        assert.match(error.message, /pdfcpu is not installed/u);
        assert.ok(!/vips is not installed/u.test(error.message));

        return true;
    });
});

test("a tool that is present but too old is reported as such", () => {
    // This is the case a presence check misses: installed, on PATH, and it
    // rejects the flag the pipeline uses on every single run.
    const host = createFakeHost({});

    host.preflight = 'strict needs extension ".pdf".';

    assert.throws(() => checkTools(host), (error) => {
        assert.match(error.message, /pdfcpu is installed but too old/u);
        assert.match(error.message, /--mode=strict/u);

        return true;
    });
});

test("an outdated vips is reported the same way", () => {
    const host = createFakeHost({});

    host.preflight = "Unknown option --export-profile";

    assert.throws(() => checkTools(host), (error) => {
        assert.match(error.message, /vips is installed but too old/u);
        // Naming the flags is the whole value of the message: it is what
        // distinguishes "upgrade vips" from "something is wrong".
        assert.match(
            error.message,
            /does not accept --size=down and --export-profile\./u
        );

        return true;
    });
});

test("the remedy adapts to whether Homebrew is present", () => {
    const withBrew = createFakeHost({ executables: [] });
    const withoutBrew = createFakeHost({ executables: [] });

    withoutBrew.brew = "";

    assert.match(
        (() => {
            try {
                checkTools(withBrew);
            } catch (error) {
                return error.message;
            }

            return "";
        })(),
        /Run this in Terminal/u
    );
    assert.throws(() => checkTools(withoutBrew), /Install Homebrew first/u);
});

test("a probe that cannot run at all is treated as unusable", () => {
    // doShellScript itself failing must not crash the check; it means the
    // tool could not answer, which is not a pass.
    const host = createFakeHost({});
    const inner = host.doShellScript;

    host.doShellScript = (command) => {
        if (command.includes("nonexistent-image-files-to-pdf-preflight")) {
            throw new Error("could not spawn");
        }

        return inner(command);
    };

    assert.throws(() => checkTools(host), /pdfcpu is installed but too old/u);
});

test("a failing Homebrew check is treated as Homebrew being absent", () => {
    const host = createFakeHost({ executables: [] });
    const inner = host.doShellScript;

    host.doShellScript = (command) => {
        if (command.includes("command -v brew")) {
            throw new Error("no shell");
        }

        return inner(command);
    };

    assert.throws(() => checkTools(host), /Install Homebrew first/u);
});
