"use strict";

/*
 * A whole conversion run in this process, on the real filesystem with the
 * real tools. Faults are injected only where a real run cannot be made to fail
 * on cue: a tool that writes an empty page, a helper that fails to close.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { execFileSync } = require("node:child_process");
const { inspectModule } = require("../../unit/ports/inspect-module.cjs");
const { commandSession } = require("../../../src/engine/processes.js");
const { DEFAULT_SETTINGS } = require("../../../src/core/settings.js");
const { message } = require("../../../src/core/messages.js");

const CONVERT = require.resolve("../../../src/engine/convert.js");

function workArea(context) {
    const folder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "iftp-convert-")));
    context.after(() => { fs.chmodSync(folder, 0o700); fs.rmSync(folder, { recursive: true, force: true }); });
    const image = path.join(folder, "photo.png");
    execFileSync("vips", ["black", image, "16", "12", "--bands", "3"], { stdio: "pipe" });
    return { folder, image };
}

async function converted(image, { convert = require("../../../src/engine/convert.js").convert } = {}) {
    const commands = commandSession();
    try { return await convert({ inputItems: [image], settings: DEFAULT_SETTINGS }, commands); }
    finally { commands.close(); }
}

test("a page a tool leaves empty fails the document in the catalog's words", async (context) => {
    const { image } = workArea(context);
    const { lstatSync } = fs;
    context.mock.method(fs, "lstatSync", (file, ...rest) => {
        const stats = lstatSync(file, ...rest);
        return /-page\.(?:png|jpg)$/u.test(String(file)) ? Object.assign(Object.create(Object.getPrototypeOf(stats)), stats, { size: 0n }) : stats;
    });
    const receipt = await converted(image);
    assert.equal(receipt.documents[0].state, "failed");
    assert.ok(receipt.documents[0].issues.some((issue) => issue.diagnostic?.message.includes(message("artifactPreparedImage"))), JSON.stringify(receipt.documents[0].issues));
});

test("a PDF that can be saved neither beside its image nor in Downloads is kept and its place named", { skip: process.platform === "win32" || process.getuid?.() === 0 }, async (context) => {
    const { folder, image } = workArea(context);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "iftp-home-"));
    context.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const saved = process.env.HOME;
    process.env.HOME = home;
    context.after(() => { process.env.HOME = saved; });
    fs.chmodSync(folder, 0o500);
    const receipt = await converted(image);
    const [document] = receipt.documents;
    assert.notEqual(document.state, "saved", JSON.stringify(document));
    assert.ok(receipt.issues.length + document.issues.length > 0);
});

test("cleaning up what cannot be removed, or while a tool may still write, is reported and not forced", async (context) => {
    const { folder } = workArea(context);
    const { configure } = inspectModule(CONVERT, ["configure"]);
    const commands = commandSession();
    const ports = configure(commands);
    try {
        const removal = ports.operations.removeFile(folder);
        assert.equal(removal.state, "failed");
        assert.equal(removal.issue.diagnostic.path, folder);
        const { storage } = await ports.capabilities();
        const workspace = await storage.create();
        fs.writeFileSync(path.join(workspace, "command-in-flight"), "");
        const guarded = ports.operations.removeFile(path.join(workspace, "page.png"));
        assert.equal(guarded.issue.message, message("workspaceWriterMayBeActive"));
        assert.deepEqual(ports.operations.setAside("/kept.pdf"), { state: "retained", path: "/kept.pdf", issues: [] });
        fs.rmSync(path.join(workspace, "command-in-flight"));
        await storage.removeWorkspace(workspace);
    } finally {
        await ports.close();
        commands.close();
    }
});

test("a platform helper that fails to close turns a finished run into a reported fault", { skip: process.platform !== "darwin" }, async (context) => {
    const { image } = workArea(context);
    const darwin = require("../../../src/engine/platform/darwin.js");
    const { darwinHelper } = darwin;
    context.mock.method(darwin, "darwinHelper", () => {
        const helper = darwinHelper();
        return { ...helper, close: async () => { await helper.close(); throw new Error("Injected: the helper did not close."); } };
    });
    delete require.cache[CONVERT];
    const fresh = require("../../../src/engine/convert.js");
    context.after(() => { delete require.cache[CONVERT]; });
    const receipt = await converted(image, { convert: fresh.convert });
    assert.ok(receipt.issues.some((issue) => /did not close/u.test(issue.diagnostic?.message ?? issue.message)), JSON.stringify(receipt.issues));
});
