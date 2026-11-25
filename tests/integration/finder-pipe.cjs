"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync, spawnSync } = require("node:child_process");
const { setTimeout: wait } = require("node:timers/promises");
const root = path.resolve(__dirname, "../..");
const { build } = require("esbuild");
function makeFixture(folder) {
    const home = path.join(folder, "home");
    const entry = path.join(folder, "probe.jxa");
    const node = path.join(folder, "node-probe");
    const pidFile = path.join(folder, "engine.pid");
    const childrenFile = path.join(folder, "children");
    const marker = path.join(folder, "killed");
    const vips = path.join(folder, "vips-probe");
    const running = path.join(folder, "running");
    const realVips = execFileSync("/usr/bin/which", ["vips"], { encoding: "utf8" }).trim();
    fs.writeFileSync(vips, '#!/bin/sh\ncase "$2" in */input-0) /usr/bin/touch "$IFTP_RUNNING"; IFS= read -r engine < "$IFTP_PID_FILE"; for n in 1 2 3 4 5 6 7 8 9 10; do /bin/kill -0 "$engine" 2>/dev/null || exit 1; /bin/sleep 0.2; done;; esac\nexec "$IFTP_VIPS" "$@"\n', { mode: 0o700 });
    const image = path.join(folder, "image.png");
    const refused = path.join(folder, "refused.txt");
    fs.mkdirSync(home);
    fs.writeFileSync(refused, "refused");
    execFileSync("vips", ["black", image, "64", "48", "--bands", "3"]);
    fs.writeFileSync(node, '#!/bin/sh\nif [ "$#" = 2 ] && [ "$2" = --serve ]; then printf "%s" "$$" > "$IFTP_PID_FILE"; printf "%s\\n" "Diagnostic from killed engine" >&2; fi\nexec "$IFTP_ACTUAL_NODE" "$@"\n', { mode: 0o700 });
    return { home, entry, node, pidFile, childrenFile, marker, vips, running, realVips, image, refused };
}

async function buildHarness(entry, bundle) {
    await build({
        stdin: { resolveDir: root, contents: `
            const { runQuickAction } = require("./src/finder/quick-action/main.js");
            const { engineSession } = require("./src/finder/quick-action/engine-client.js");
            const { collectInvocation } = require("./src/finder/quick-action/input.js");
            const { DEFAULT_SETTINGS } = require("./src/core/settings.js");
            const bundle = ${JSON.stringify(bundle)};
            function run([mode, node, home, image, refused, pidFile, childrenFile, marker, running, expected, vips]) {
                ObjC.import("Foundation");
                ObjC.bindFunction("kill", ["int", ["int", "int"]]);
                ObjC.bindFunction("signal", ["long", ["int", "long"]]);
                const original = $.signal(13, Number(expected));
                const app = Application.currentApplication();
                app.includeStandardAdditions = true;
                const quote = (value) => "'" + value.replace(/'/gu, "'\\\\''") + "'";
                let killed = false, pending = false, receipt = null;
                function killEngine() {
                    const pid = Number(app.doShellScript("/bin/cat " + quote(pidFile)));
                    if (!Number.isInteger(pid) || pid <= 1) throw new Error("bad PID");
                    app.doShellScript("/bin/ps -axo pid=,ppid= | /usr/bin/awk '$2 == " + pid + " { print $1 }' > " + quote(childrenFile));
                    if ($.kill(pid, 9) !== 0) throw new Error("kill failed");
                    app.doShellScript("/usr/bin/touch " + quote(marker));
                    for (let attempt = 0; attempt < 100 && $.kill(pid, 0) === 0; attempt += 1) {
                        $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.01));
                    }
                    killed = true;
                }
                const progress = { diagnostics: [], close() {}, pause() {},
                    progress(event) { if (mode === "progress" && event.type === "phase" && event.phase === "Preparing") pending = true; },
                    stopped() { if (pending && !killed && $.NSFileManager.defaultManager.fileExistsAtPath(running)) { killEngine(); return true; } return false; } };
                runQuickAction([[image, refused], {}], {
                    application: () => app, openProgress: () => progress, collect: collectInvocation,
                    review() { if (mode === "review") killEngine(); },
                    settings() { return DEFAULT_SETTINGS; },
                    runEngine(items, hooks) { return engineSession(bundle, items, hooks, { chosen: { node, vips }, home }); },
                    result(app, outcome) { receipt = outcome; }
                });
                const restored = $.signal(13, original);
                return JSON.stringify({ killed, receipt, restored: Number(restored) });
            }
            module.exports = { run };
        ` },
        bundle: true, platform: "neutral", format: "iife", globalName: "FinderPipeProbe",
        outfile: entry, footer: { js: "function run(input) { return FinderPipeProbe.run(input); }" }
    });
}

async function verifyChildren(pidFile, childrenFile) {
    const enginePid = Number(fs.readFileSync(pidFile, "utf8"));
    const children = fs.readFileSync(childrenFile, "utf8").trim().split(/\s+/u).filter(Boolean).map(Number);
    const otherCommands = () => children.map((pid) => spawnSync("/bin/ps", ["-p", String(pid), "-o", "comm="], { encoding: "utf8" }).stdout.trim()).filter(Boolean);
    const initialSurvivors = otherCommands().map((value) => path.basename(value));
    assert.ok(!initialSurvivors.some((value) => /(?:node|osascript)$/u.test(value)), JSON.stringify(initialSurvivors));
    assert.equal(spawnSync("/bin/ps", ["-p", String(enginePid)]).status, 1);
    // eslint-disable-next-line no-await-in-loop -- Poll only the children of this fixture until they settle.
    for (let check = 0; check < 20 && otherCommands().length; check += 1) { await wait(100); }
    assert.deepEqual(otherCommands(), []);
    return otherCommands().length;
}

async function runScenario(fixture, mode, expected) {
    const { entry, node, home, image, refused, pidFile, childrenFile, marker, running, vips, realVips } = fixture;
    const result = spawnSync("/usr/bin/osascript", ["-l", "JavaScript", entry, mode, node, home, image, refused, pidFile, childrenFile, marker, running, String(expected), vips], {
        encoding: "utf8", timeout: 30000,
        env: { ...process.env, HOME: home, IFTP_PID_FILE: pidFile, IFTP_ACTUAL_NODE: process.execPath, IFTP_VIPS: realVips, IFTP_RUNNING: running }
    });
    assert.ok(fs.existsSync(marker), `kill was not reached for ${mode}: ${JSON.stringify(result)}`);
    fs.unlinkSync(marker);
    if (fs.existsSync(running)) { fs.unlinkSync(running); }
    const remainingChildren = await verifyChildren(pidFile, childrenFile);
    assert.equal(result.status, 0, result.stderr);
    const { killed, receipt, restored } = JSON.parse(result.stdout);
    assert.equal(killed, true);
    assert.equal(restored, expected);
    assert.match(receipt.issues[0].message, /did not complete the session/u);
    assert.equal(receipt.issues[0].diagnostic.status, 9);
    assert.match(receipt.issues[0].diagnostic.message, /Diagnostic from killed engine/u);
    process.stdout.write(`${JSON.stringify({ mode, initialDisposition: expected, restored, hostExit: result.status, engineStatus: receipt.issues[0].diagnostic.status, remainingChildren })}\n`);
}

async function main() {
    const { embeddedEngineIn } = await import("../../tools/embedded-engine.mjs");
    const bundle = embeddedEngineIn(fs.readFileSync(path.join(root, "dist/Image-Files-to-PDF.jxa"), "utf8"), 2022);
    using probe = fs.mkdtempDisposableSync(path.join(os.tmpdir(), "iftp-finder-pipe-"));
    const fixture = makeFixture(probe.path);
    await buildHarness(fixture.entry, bundle);
    for (const [mode, expected] of [["review", 0], ["progress", 0], ["review", 1], ["progress", 1]]) {
        // eslint-disable-next-line no-await-in-loop -- Each scenario owns the same fixture paths until its children exit.
        await runScenario(fixture, mode, expected);
    }
}

main().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
