"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { build } = require("esbuild");
const { assertReceipt } = require("./lib/receipt.cjs");

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

async function buildHarness(folder, engineBundle, plugins = []) {
    const probe = path.join(folder, "finder-probe.jxa");
    const contents = `
        const { runQuickAction } = require("./src/finder/quick-action/main.js");
        const { engineSession } = require("./src/finder/quick-action/engine-client.js");
        const { collectInvocation } = require("./src/finder/quick-action/input.js");
        const { executableMemory } = require("./src/finder/quick-action/executable-choice.js");
        const { answerSettings } = require("./tests/integration/lib/settings-answers.js");
        const { DEFAULT_SETTINGS } = require("./src/core/settings.js");
        const bundle = ${JSON.stringify(engineBundle)};
        function run([home, photos, refused, configuration]) {
            const { node, alternate, domain, choices = {}, directories, settingsScenario } = JSON.parse(configuration);
            const events = [];
            const progressEvents = [];
            const offers = [];
            const settingsProbe = { forms: 0, lists: 0, prompts: [], confirmed: 0 };
            let engineReceipt = null;
            let receipt = null;
            const progress = { diagnostics: [], pause() {}, close() {},
                progress(event) {
                    if (event.type === "phase") events.push(event.phase);
                    else progressEvents.push([events.at(-1), event.done, event.current ?? ""]);
                }, stopped() { return false; } };
            const selected = alternate ? { filename: "engine-wrong.cjs", source: alternate } : bundle;
            const ports = {
                application: () => null, openProgress: () => progress, collect: collectInvocation,
                review(app, context) { events.push(["review", context.rejected.length]); },
                settings(app, context) {
                    events.push(["settings", context.count]);
                    return settingsScenario ? answerSettings(settingsScenario, context, settingsProbe) : DEFAULT_SETTINGS;
                },
                runEngine(items, hooks, chosen) {
                    engineReceipt = engineSession(selected, items, hooks, { chosen: node ? { node, ...chosen } : chosen, directories, home });
                    return engineReceipt;
                },
                result(app, result) { receipt = result; }
            };
            if (domain) {
                ports.executableMemory = () => executableMemory(domain);
                ports.chooseExecutable = (app, name, report) => {
                    offers.push({ name, issues: report.issues });
                    return choices[name];
                };
            }
            const items = settingsScenario ? [photos + "/visible.png"] : [photos, refused];
            const returned = runQuickAction([items, {}], ports);
            if (returned !== undefined) throw new Error("The Finder handler returned a Shortcuts result.");
            return JSON.stringify({ receipt, events, progressEvents, offers, engineReceipt, settingsProbe });
        }
        module.exports = { run };
    `;
    await build({ stdin: { contents, resolveDir: root }, outfile: probe, bundle: true, platform: "neutral", plugins,
        format: "iife", globalName: "FinderProbe", target: "safari15.4",
        footer: { js: "function run(input) { return FinderProbe.run(input); }" } });
    return probe;
}

function invoke(probe, { home, photos, refused, ambient, marker }, options = {}) {
    const configuration = JSON.stringify({ node: process.execPath, ...options });
    const result = execFileSync("/usr/bin/osascript", ["-l", "JavaScript", probe, home, photos, refused, configuration],
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
        const issue = rejected.issues.find(({ code }) => code === "runtime-unavailable");
        assert.match(issue.message, /26\.13\.1.*Found .*installation guide .*#macos/su);
        assert.deepEqual(issue.params, { minimum: "26.13.1", found: [{ path: node, version: version.slice(1) }] });
        assert.deepEqual(rejectedEvents, []);
        process.stdout.write(`Finder refused unsupported Node ${version} with its executable path, version and installation guide.\n`);
    }
}

function verifyMissingRuntimes(probe, fixture, folder) {
    const { receipt: missing } = invoke(probe, fixture, { node: null, directories: [path.join(folder, "absent-bin")] });
    assert.equal(missing.state, "setup-failed");
    assert.equal(missing.issues[0].code, "runtime-unavailable");
    assert.match(missing.issues[0].message, /installation guide .*#macos/u);
    assert.deepEqual(missing.issues[0].params, { minimum: "26.13.1", found: [] });
    const silent = path.join(folder, "silent-node");
    fs.writeFileSync(silent, "#!/bin/sh\nexit 2\n", { mode: 0o700 });
    const { receipt: noVersion } = invoke(probe, fixture, { node: silent });
    assert.deepEqual(noVersion.issues[0].params, { name: "node", path: silent });
    assert.deepEqual(noVersion.issues[1].params.found, [{ path: silent }]);
}

function installFixtures(directory) {
    fs.mkdirSync(directory, { recursive: true });
    const executable = (name) => execFileSync("/usr/bin/which", [name], { encoding: "utf8" }).trim();
    const tools = { node: process.execPath, vips: executable("vips"), vipsheader: executable("vipsheader"), pdfcpu: executable("pdfcpu") };
    return Object.fromEntries(Object.entries(tools).map(([name, source]) => {
        const file = path.join(directory, name);
        fs.symlinkSync(source, file);
        return [name, file];
    }));
}

function fixtureSearch(paths, fragments, conventional) {
    const definitions = { SYSTEM_PATHS: paths, SYSTEM_FRAGMENTS: fragments, CONVENTIONAL_DIRECTORIES: conventional };
    return {
        name: "fixture-system-paths",
        setup(bundle) {
            // eslint-disable-next-line require-unicode-regexp -- esbuild uses Go's regular expression engine.
            bundle.onLoad({ filter: /\/core\/executable-search\.js$/ }, (input) => {
                let contents = fs.readFileSync(input.path, "utf8");
                for (const [name, value] of Object.entries(definitions)) {
                    const declaration = new RegExp(`^const ${name} = [^;]+;`, "mu");
                    assert.match(contents, declaration);
                    contents = contents.replace(declaration, () => `const ${name} = ${JSON.stringify(value)};`);
                }
                return { contents };
            });
        }
    };
}

async function discoveryHarness(folder, conventional = []) {
    const paths = path.join(folder, "paths");
    const fragments = path.join(folder, "paths.d");
    fs.mkdirSync(fragments);
    fs.writeFileSync(paths, "~/ignored\nrelative");
    const plugins = [fixtureSearch(paths, fragments, conventional)];
    const { outputFiles } = await build({ entryPoints: [path.join(root, "src/serve/entry.js")],
        bundle: true, platform: "node", format: "cjs", write: false, plugins });
    const source = outputFiles[0].text;
    const digest = createHash("sha256").update(source).digest("hex").slice(0, 12);
    const probe = await buildHarness(folder, { filename: `engine-discovery-${digest}.cjs`, source }, plugins);
    return { probe, fragments };
}

async function verifySystemDiscovery(folder, fixture) {
    const listed = path.join(folder, "path-file-discovery");
    fs.mkdirSync(listed);
    const { probe, fragments } = await discoveryHarness(listed);
    const directory = path.join(listed, "registered tools");
    installFixtures(directory);
    fs.writeFileSync(path.join(fragments, "20-tools"), directory);
    verifyConversion(invoke(probe, fixture, { node: null }));

    const conventional = path.join(folder, "conventional-discovery");
    const prefix = path.join(conventional, "opt/local/bin");
    installFixtures(prefix);
    const { probe: prefixProbe } = await discoveryHarness(conventional, [prefix]);
    verifyConversion(invoke(prefixProbe, fixture, { node: null }));
}

async function verifyChosenDiscovery(folder, fixture) {
    const chosen = path.join(folder, "chosen-discovery");
    const choices = installFixtures(path.join(chosen, "chosen tools"));
    const { probe } = await discoveryHarness(chosen);
    const domain = `com.resoltico.ImageFilesToPDF.NativeQA.${randomUUID()}`;
    const options = { domain, node: null };
    try {
        const first = invoke(probe, fixture, { ...options, choices });
        verifyConversion(first);
        assert.deepEqual(first.offers.map(({ name }) => name), ["node", "vips", "vipsheader", "pdfcpu"]);
        const recalled = invoke(probe, fixture, options);
        verifyConversion(recalled);
        assert.deepEqual(recalled.offers, []);
        fs.unlinkSync(choices.vips);
        fs.symlinkSync("/usr/bin/true", choices.vips);
        const replacement = installFixtures(path.join(chosen, "replacement tools")).vips;
        const retry = invoke(probe, fixture, { ...options, choices: { vips: replacement } });
        verifyConversion(retry);
        assert.deepEqual(retry.offers.map(({ name }) => name), ["vips"]);
        assert.deepEqual(retry.offers[0].issues[0].params, { name: "vips", path: choices.vips });
        assert.equal(retry.offers[0].issues[0].code, "chosen-executable-invalid");
        assertReceipt({ state: "setup-failed", documents: [], rejected: [], diagnostics: [], issues: retry.offers[0].issues });
    } finally {
        execFileSync("/usr/bin/defaults", ["delete", domain]);
    }
}

function verifySettingsFallback(probe, fixture) {
    const run = (settingsScenario) => invoke(probe, fixture, { settingsScenario });
    const expectedSettings = { mode: "separate", paperSize: "Letter", orientation: "Landscape",
        resolutionLimit: 360, quality: 74, background: "#8E79E0" };
    const source = path.join(fixture.photos, "visible.png");
    const checkSaved = ({ engineReceipt, settingsProbe }) => {
        assertReceipt(engineReceipt);
        assert.equal(engineReceipt.state, "complete");
        assert.equal(engineReceipt.documents.length, 1);
        const [{ state, pages, sources, issues, output }] = engineReceipt.documents;
        assert.deepEqual({ state, pages, sources, issues }, { state: "saved", pages: 1, sources: [source], issues: [] });
        assert.deepEqual(settingsProbe.remembered, expectedSettings);
        const pdf = execFileSync("pdfinfo", [output], { encoding: "utf8" });
        assert.match(pdf, /^Page size:\s+792 x 612 pts/mu);
        fs.unlinkSync(output);
    };
    const form = run("form");
    checkSaved(form);
    assert.deepEqual([form.settingsProbe.forms, form.settingsProbe.lists, form.settingsProbe.confirmed], [1, 0, 0]);
    const dialogs = run("valid");
    checkSaved(dialogs);
    assert.deepEqual([dialogs.settingsProbe.forms, dialogs.settingsProbe.lists, dialogs.settingsProbe.confirmed], [1, 4, 1]);
    assert.equal(dialogs.settingsProbe.prompts.length, 3);
    const corrected = run("corrected");
    checkSaved(corrected);
    assert.deepEqual([corrected.settingsProbe.forms, corrected.settingsProbe.lists, corrected.settingsProbe.confirmed], [1, 4, 1]);
    assert.equal(corrected.settingsProbe.prompts.length, 4);
    assert.match(corrected.settingsProbe.prompts[1].text, /72.*1017/u);
    assert.equal(corrected.settingsProbe.prompts[1].opening, "1018");
    const canceled = run("cancel");
    assert.equal(canceled.receipt, null);
    assert.equal(canceled.engineReceipt.state, "canceled");
    assert.deepEqual(canceled.engineReceipt.documents, []);
    assert.deepEqual(canceled.settingsProbe, { forms: 1, lists: 1, prompts: [], confirmed: 0 });
    assert.equal(fs.existsSync(path.join(fixture.photos, "visible.pdf")), false);
    process.stdout.write("Unusable settings form: stepwise answers, correction and cancellation passed through the real Finder engine.\n");
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
    await verifySystemDiscovery(work.path, fixture);
    await verifyChosenDiscovery(work.path, fixture);
    verifySettingsFallback(probe, fixture);
    const mismatch = 'process.stdout.write(JSON.stringify({type:"hello",version:"0.0.0",runtime:process.versions.node})+"\\n");process.stdin.resume();';
    const { receipt: wrong, events } = invoke(probe, fixture, { alternate: mismatch });
    assert.equal(wrong.state, "setup-failed");
    assert.match(wrong.issues[0].message, /expected version/u);
    assert.deepEqual(events, []);
    assert.equal(fs.existsSync(fixture.marker), false);
    process.stdout.write("Finder osascript engine, package parity, cache, runtime, system path files, conventional discovery and remembered executable checks passed.\n");
}

main().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
