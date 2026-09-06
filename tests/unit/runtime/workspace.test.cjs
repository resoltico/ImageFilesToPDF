"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createWorkspace,
    removeWorkspace,
    nonce
} = require("../../../src/runtime/workspace.js");
const { createFakeApp, failing } = require("./fake-app.cjs");

const GOOD = "/var/folders/xx/T/ImageFilesToPDF.AbC123";

test("createWorkspace accepts a well-formed mktemp path", () => {
    const app = createFakeApp([["mktemp", `${GOOD}\n`]]);

    assert.equal(createWorkspace(app), GOOD);
    assert.match(app.commands[0], /'-d' '-t' 'ImageFilesToPDF'/u);
});

test("createWorkspace refuses a surprising mktemp result", () => {
    // The path is later removed with rm -rf, so an unexpected shape must stop
    // the run rather than be trusted.
    for (const bad of ["/tmp", "/", "/tmp/something-else", ""]) {
        const app = createFakeApp([["mktemp", bad]]);

        assert.throws(
            () => createWorkspace(app),
            /unexpected workspace path/u,
            `expected ${bad} to be rejected`
        );
    }
});

test("removeWorkspace only removes a path of the expected shape", () => {
    for (const bad of ["", "/", "/tmp", "/Users/someone/Documents"]) {
        const app = createFakeApp();

        removeWorkspace(app, bad);
        assert.equal(app.commands.length, 0, `must not remove ${bad}`);
    }
});

test("removeWorkspace removes a genuine workspace", () => {
    const app = createFakeApp();

    removeWorkspace(app, GOOD);
    assert.equal(app.commands[0], `'/bin/rm' '-rf' '${GOOD}'`);
});

test("removeWorkspace does not mask an earlier failure", () => {
    const app = createFakeApp([["/bin/rm", new Error("busy")]]);

    assert.doesNotThrow(() => removeWorkspace(app, GOOD));
});

test("nonce is unique enough to separate concurrent runs", () => {
    const values = new Set();

    for (let index = 0; index < 200; index += 1) {
        values.add(nonce());
    }

    assert.equal(values.size, 200);
    assert.match(nonce(), /^\d+-\d+$/u);
});

test("the workspace guard anchors at the end of the path", () => {
    // This guard stands in front of `rm -rf`. Unanchored, a path that merely
    // contains the workspace name would be accepted and a directory below it
    // removed recursively.
    const app = createFakeApp();

    removeWorkspace(app, `${GOOD}/nested/somewhere`);
    assert.equal(app.commands.length, 0, "must not remove a path below the workspace");

    removeWorkspace(app, "/Users/someone/ImageFilesToPDF.notatemp/Documents");
    assert.equal(app.commands.length, 0);
});

test("createWorkspace applies the same anchoring", () => {
    const app = createFakeApp([["mktemp", `${GOOD}/deeper`]]);

    assert.throws(() => createWorkspace(app), /unexpected workspace path/u);
});

test("a workspace that cannot be made says what was being attempted", () => {
    // This one is fatal and reaches the user: mktemp's own message says the
    // template failed, without saying what the template was for.
    const app = createFakeApp([["mktemp", failing("no space left on device")]]);

    assert.throws(
        () => createWorkspace(app),
        /creating temporary workspace/u
    );
});
