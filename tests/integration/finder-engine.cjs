"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { build } = require("esbuild");

const root = path.resolve(__dirname, "../..");

function makeFixtures(folder) {
    const home = path.join(folder, "home");
    const photos = path.join(folder, "photos");
    const refused = path.join(folder, "refused.txt");
    const ambient = path.join(folder, "ambient");
    const marker = path.join(folder, "ambient-executed");
    fs.mkdirSync(home);
    fs.mkdirSync(photos);
    fs.mkdirSync(ambient);
    fs.writeFileSync(path.join(ambient, "vips"), '#!/bin/sh\n/bin/touch "$IFTP_AMBIENT_MARKER"\nexit 1\n', { mode: 0o700 });
    fs.writeFileSync(refused, "This entry cannot convert.");
    const photo = path.join(photos, "visible.png");
    execFileSync("vips", ["black", photo, "64", "48", "--bands", "3"]);
    fs.copyFileSync(photo, path.join(photos, "visible 2.png"));
    fs.copyFileSync(photo, path.join(photos, "visible 3.png"));
    for (const name of ["project.xcodeproj", "song.band", "library.photoslibrary"]) {
        const bundle = path.join(photos, name);
        fs.mkdirSync(bundle);
        fs.copyFileSync(photo, path.join(bundle, "inner.png"));
    }
    return { home, photos, refused, ambient, marker };
}

async function buildHarness(folder, engineBundle) {
    const probe = path.join(folder, "finder-probe.jxa");
    const contents = `
        const { runQuickAction } = require("./src/finder/quick-action/main.js");
        const { engineSession } = require("./src/finder/quick-action/engine-client.js");
        const { collectInvocation } = require("./src/finder/quick-action/input.js");
        const { DEFAULT_SETTINGS } = require("./src/core/settings.js");
        const bundle = ${JSON.stringify(engineBundle)};
        function run([node, home, photos, refused, mismatchedSource]) {
            const events = [];
            const progressEvents = [];
            let receipt = null;
            const progress = { diagnostics: [], pause() {}, close() {},
                progress(event) {
                    if (event.type === "phase") events.push(event.phase);
                    else progressEvents.push([events.at(-1), event.done, event.current ?? ""]);
                }, stopped() { return false; } };
            const selected = mismatchedSource ? { filename: "engine-wrong.cjs", source: mismatchedSource } : bundle;
            const ports = {
                application: () => null, openProgress: () => progress, collect: collectInvocation,
                review(app, context) { events.push(["review", context.rejected.length]); },
                settings(app, context) { events.push(["settings", context.count]); return DEFAULT_SETTINGS; },
                runEngine(items, hooks) { return engineSession(selected, items, hooks, { paths: [node], home }); },
                result(app, result) { receipt = result; }
            };
            const returned = runQuickAction([[photos, refused], {}], ports);
            if (returned !== undefined) throw new Error("The Finder handler returned a Shortcuts result.");
            return JSON.stringify({ receipt, events, progressEvents });
        }
        module.exports = { run };
    `;
    await build({ stdin: { contents, resolveDir: root }, outfile: probe, bundle: true, platform: "neutral",
        format: "iife", globalName: "FinderProbe", target: "safari15.4",
        footer: { js: "function run(input) { return FinderProbe.run(input); }" } });
    return probe;
}

function invoke(probe, { home, photos, refused, ambient, marker }, { node = process.execPath, alternate = "" } = {}) {
    const result = execFileSync("/usr/bin/osascript", ["-l", "JavaScript", probe, node, home, photos, refused, alternate],
        { encoding: "utf8", timeout: 45000, env: { ...process.env, HOME: home, PATH: `${ambient}:/usr/bin:/bin:/usr/sbin:/sbin`, IFTP_AMBIENT_MARKER: marker } });
    return JSON.parse(result);
}

function verifyProgress(events, names) {
    const encoding = events.filter(([phase, done]) => phase === "Preparing" && done < names.length);
    assert.deepEqual(encoding, names.map((name, index) => ["Preparing", index, `${index + 1} of 3 — ${name}`]));
    const capturing = events.filter(([phase]) => phase === "Capturing and checking images");
    assert.ok(capturing.length > 0 && capturing.every(([, , detail]) => detail === ""), JSON.stringify(capturing));
    const pdfPhases = new Set(["Creating PDF", "Assembling PDF", "Validating PDF", "Saving PDF"]);
    const pdfEvents = events.filter(([phase]) => pdfPhases.has(phase));
    assert.deepEqual(new Set(pdfEvents.map(([phase]) => phase)), pdfPhases);
    assert.ok(pdfEvents.every(([, , detail]) => detail === ""), JSON.stringify(pdfEvents));
}

function verifyConversion({ receipt, events, progressEvents }) {
    assert.equal(receipt.state, "incomplete", JSON.stringify(receipt));
    const names = ["visible 2.png", "visible 3.png", "visible.png"];
    assert.deepEqual(receipt.documents[0].sources.map((source) => path.basename(source)), names);
    assert.equal(receipt.documents[0].pages, 3);
    assert.deepEqual(events.filter(Array.isArray), [["review", 1], ["settings", 3]]);
    assert.equal(events.at(-1), "Saved");
    verifyProgress(progressEvents, names);
    const [{ output }] = receipt.documents;
    execFileSync("pdfcpu", ["validate", "--conf", "disable", "--mode=strict", output]);
    execFileSync("qpdf", ["--check", output]);
}

function verifyCache(folder, probe, fixture, bundle) {
    const cache = path.join(fixture.home, "Library/Application Support/Image Files to PDF/Engine");
    const engine = path.join(cache, bundle.filename);
    verifyConversion(invoke(probe, fixture));
    assert.equal(fs.readFileSync(engine, "utf8"), bundle.source);
    const copied = fs.statSync(engine, { bigint: true });
    verifyConversion(invoke(probe, fixture));
    const reused = fs.statSync(engine, { bigint: true });
    assert.deepEqual([reused.ino, reused.mtimeNs], [copied.ino, copied.mtimeNs]);
    const marker = path.join(folder, "unexpected-execution");
    fs.writeFileSync(engine, `require("node:fs").writeFileSync(${JSON.stringify(marker)},"unexpected")`);
    const stale = path.join(cache, "engine-owned-stale.cjs");
    const linked = path.join(cache, "engine-link.cjs");
    fs.writeFileSync(stale, "Owned stale file.");
    fs.symlinkSync(fixture.refused, linked);
    verifyConversion(invoke(probe, fixture));
    assert.equal(fs.readFileSync(engine, "utf8"), bundle.source);
    assert.equal(fs.existsSync(marker), false);
    assert.equal(fs.existsSync(stale), false);
    assert.equal(fs.lstatSync(linked).isSymbolicLink(), true);
}

function verifyRejectedRuntimes(probe, fixture) {
    for (const node of (process.env.IFTP_REJECTED_NODE ?? "").split(path.delimiter).filter(Boolean)) {
        const version = execFileSync(node, ["--version"], { encoding: "utf8" }).trim();
        const { receipt: rejected, events: rejectedEvents } = invoke(probe, fixture, { node });
        assert.equal(rejected.state, "setup-failed");
        assert.equal(rejected.issues[0].code, "runtime-unavailable");
        assert.match(rejected.issues[0].message, /26\.13\.1.*brew upgrade node/su);
        assert.deepEqual(rejected.issues[0].params, { minimum: "26.13.1", found: [{ path: node, version: version.slice(1) }] });
        assert.deepEqual(rejectedEvents, []);
        process.stdout.write(`Finder refused unsupported Node ${version} with its executable path, version and upgrade hint.\n`);
    }
}

function verifyMissingRuntimes(probe, fixture, folder) {
    const { receipt: missing } = invoke(probe, fixture, { node: path.join(folder, "absent-node") });
    assert.equal(missing.state, "setup-failed");
    assert.equal(missing.issues[0].code, "runtime-unavailable");
    assert.match(missing.issues[0].message, /brew install node/u);
    assert.deepEqual(missing.issues[0].params, { minimum: "26.13.1", found: [] });
    const silent = path.join(folder, "silent-node");
    fs.writeFileSync(silent, "#!/bin/sh\nexit 2\n", { mode: 0o700 });
    const { receipt: noVersion } = invoke(probe, fixture, { node: silent });
    assert.deepEqual(noVersion.issues[0].params.found, [{ path: silent }]);
}

async function main() {
    const { embeddedEngineIn } = await import("../../tools/embedded-engine.mjs");
    const artifact = fs.readFileSync(path.join(root, "dist/Image-Files-to-PDF.jxa"), "utf8");
    const bundle = embeddedEngineIn(artifact, 2022);
    assert.ok(bundle);
    const digest = createHash("sha256").update(bundle.source).digest("hex");
    assert.match(bundle.filename, new RegExp(`-${digest.slice(0, 12)}\\.cjs$`, "u"));
    using work = fs.mkdtempDisposableSync(path.join(fs.realpathSync(os.tmpdir()), "iftp-finder-probe-"));
    const fixture = makeFixtures(work.path);
    const probe = await buildHarness(work.path, { filename: bundle.filename, source: bundle.source });
    verifyCache(work.path, probe, fixture, bundle);
    verifyMissingRuntimes(probe, fixture, work.path);
    verifyRejectedRuntimes(probe, fixture);
    const mismatch = 'process.stdout.write(JSON.stringify({type:"hello",version:"0.0.0",runtime:process.versions.node})+"\\n");process.stdin.resume();';
    const { receipt: wrong, events } = invoke(probe, fixture, { alternate: mismatch });
    assert.equal(wrong.state, "setup-failed");
    assert.match(wrong.issues[0].message, /expected version/u);
    assert.deepEqual(events, []);
    assert.equal(fs.existsSync(fixture.marker), false);
    process.stdout.write("Finder osascript engine, package parity, materialization and runtime checks passed.\n");
}

main().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
