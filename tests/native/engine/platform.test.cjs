"use strict";

/*
 * Where the engine finds things on each platform: its tools, its workspace and
 * Downloads, local pathnames, and the Windows helper. Each case runs on the
 * platform its code is for.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { execFileSync } = require("node:child_process");
const { inspectModule } = require("../../unit/ports/inspect-module.cjs");
const { resolvedSource } = require("../../../src/engine/paths.js");
const { locations } = require("../../../src/engine/workspace-locations.js");
const { message } = require("../../../src/core/messages.js");

const WINDOWS = process.platform === "win32";
const TOOLS = require.resolve("../../../src/engine/tools.js");
const { inheritedSearch, finderSearch, locate } = inspectModule(TOOLS, ["inheritedSearch", "finderSearch", "locate"]);

// Sets environment variables for one test, putting back what was there.
function environment(context, values) {
    const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
    const put = (entries) => {
        for (const [key, value] of Object.entries(entries)) {
            if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; }
        }
    };
    put(values);
    context.after(() => put(saved));
}

function folder(context) {
    const made = fs.mkdtempSync(path.join(os.tmpdir(), "iftp-platform-"));
    context.after(() => fs.rmSync(made, { recursive: true, force: true }));
    return fs.realpathSync(made);
}

test("with no search path at all, nothing is searched", (context) => {
    const key = WINDOWS ? Object.keys(process.env).find((name) => name.toUpperCase() === "PATH") : "PATH";
    environment(context, { [key]: undefined });
    assert.deepEqual(inheritedSearch(), [""]);
});

test("the Finder's search reads macOS path files, and skips what it cannot read", { skip: WINDOWS }, (context) => {
    const found = finderSearch();
    assert.ok(found.includes("/opt/homebrew/bin"), "the conventional directories follow the path files");
    const { lstatSync } = fs;
    context.mock.method(fs, "lstatSync", (file, ...rest) => (file === "/etc/paths" ? { isFile: () => false } : lstatSync(file, ...rest)));
    assert.ok(finderSearch().includes("/opt/homebrew/bin"));
});

test("a chosen tool is used as given, and one that is not a runnable file is named but not used", { skip: WINDOWS }, () => {
    const vips = execFileSync("sh", ["-c", "command -v vips"], { encoding: "utf8" }).trim();
    assert.deepEqual(locate("vips", [], { vips }), { file: vips, override: { path: vips } });
    assert.deepEqual(locate("vips", [], { vips: "/no/such/vips" }), { file: null, override: { path: "/no/such/vips" } });
});

test("a pathname given with a trailing slash keeps it, and the root stays the root", { skip: WINDOWS }, (context) => {
    const made = folder(context);
    assert.equal(resolvedSource(`${made}/`).path, `${made}/`);
    assert.equal(resolvedSource("/").path, "/");
});

test("a Windows pathname that is reserved, or not on a drive, is refused", { skip: !WINDOWS }, (context) => {
    assert.equal(resolvedSource("C:\\folder\\con").refusal.code, "not-a-path");
    // A relative name resolved inside a network folder is not on a local drive.
    context.mock.method(process, "cwd", () => "\\\\server\\share\\folder");
    assert.equal(resolvedSource("photo.png").refusal.code, "not-a-path");
    assert.ok(resolvedSource("C:\\folder\\").path.endsWith("/"));
});

test("Downloads that cannot be found is no Downloads, and anything else that fails is a fault", async (context) => {
    if (process.platform === "linux") {
        // A Downloads folder Linux names, so there is one to look at.
        const configured = folder(context);
        fs.writeFileSync(path.join(configured, "user-dirs.dirs"), `XDG_DOWNLOAD_DIR="${configured}"\n`);
        environment(context, { XDG_CONFIG_HOME: configured });
    }
    const checked = (code) => ({ checked() { throw Object.assign(new Error(code), { code }); } });
    const helper = (downloads) => (WINDOWS ? { downloads: () => Promise.resolve(downloads) } : undefined);
    if (WINDOWS) {
        assert.equal((await locations(checked("ENOENT"), helper("C:\\Users\\x\\Downloads"))).downloads, null);
        assert.equal((await locations(checked("ENOENT"), helper(null))).downloads, null, "a helper that knows no Downloads");
        await assert.rejects(locations(checked("EACCES"), helper("C:\\Users\\x\\Downloads")), /EACCES/u);
    } else {
        assert.equal((await locations(checked("ENOTDIR"))).downloads, null);
        await assert.rejects(locations(checked("EACCES")), /EACCES/u);
    }
});

test("on Linux, a configuration that is not a folder is no Downloads, and one that cannot be read is a fault", { skip: process.platform !== "linux" }, (context) => {
    const { linuxDownloads } = require("../../../src/engine/platform/linux.js");
    const made = folder(context);
    fs.writeFileSync(path.join(made, "file"), "");
    environment(context, { XDG_CONFIG_HOME: path.join(made, "file") });
    assert.equal(linuxDownloads(made), null);
    const { readFileSync } = fs;
    context.mock.method(fs, "readFileSync", (file, ...rest) => {
        if (String(file).endsWith("user-dirs.dirs")) { throw Object.assign(new Error("denied"), { code: "EACCES" }); }
        return readFileSync(file, ...rest);
    });
    assert.throws(() => linuxDownloads(made), { code: "EACCES" });
});

test("on Windows, the workspace needs a drive-absolute LOCALAPPDATA", { skip: !WINDOWS }, async (context) => {
    for (const value of ["relative", undefined]) {
        environment(context, { LOCALAPPDATA: value });
        await assert.rejects(locations({ checked: () => ({ kind: "directory" }) }, { downloads: () => Promise.resolve(null) }),
            (error) => error.message === message("workspaceLocalAppDataUnavailable"), String(value));
    }
});

test("on Windows, the helper needs the system folder, and a fact it cannot give is refused", { skip: !WINDOWS }, async (context) => {
    const { windowsNative } = require("../../../src/engine/platform/win32.js");
    const running = { stopped: () => false };
    environment(context, { SystemRoot: "relative" });
    assert.throws(() => windowsNative(running), (error) => error.message === message("windowsSystemDirectoryUnavailable"));
    environment(context, { SystemRoot: process.env.windir });
    const native = windowsNative(running);
    await assert.rejects(native.entries(path.join(folder(context), "missing")),
        (error) => error.message === message("windowsPlatformFactUnavailable", { type: "entries" }));
    await native.close();
    await assert.rejects(native.downloads(), "a helper that has ended answers nothing");
    // A helper that fails once Stop was asked is the stop, not a fault.
    const stopping = windowsNative({ stopped: () => true });
    await stopping.entries(folder(context));
    await stopping.close();
    await assert.rejects(stopping.downloads(), { name: "UserCanceled" });
});
