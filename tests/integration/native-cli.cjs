"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile, execFileSync, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { fileURLToPath, pathToFileURL } = require("node:url");
const { parseReceipt } = require("./lib/receipt.cjs");
const heifFixtures = require("./lib/heif-fixtures.cjs");
const { pngFixtures } = require("./lib/png-fixtures.cjs");

const run = promisify(execFile);
const artifact = path.resolve(process.argv[2] ?? "dist/Image-Files-to-PDF.cjs");
const windows = process.platform === "win32";
const settings = { mode: "combined", paperSize: "A4", orientation: "Portrait", resolutionLimit: 300, quality: 82, background: "#FFFFFF", timestamp: "20261029_012345" };
const ROUNDS = 12;

async function cli(args, cwd, expected = 0, { env = process.env, timeout = 90000 } = {}) {
    const result = await run(process.execPath, [artifact, ...args], { cwd, env, encoding: "utf8", timeout }).catch((error) => error);
    assert.equal(result.code ?? 0, expected, `${result.stderr}\n${result.stdout}`);
    assert.doesNotMatch(result.stderr, /\n\s+at\s+\S/u);
    return result.stdout;
}

function config(folder, mode = "combined") {
    const file = path.join(folder, `page settings ${mode}.json`);
    fs.writeFileSync(file, JSON.stringify({ ...settings, mode }));
    return file;
}

function verifyPdf(file, pages) {
    execFileSync("pdfcpu", ["validate", "--conf", "disable", "--mode=strict", file], { stdio: "pipe" });
    execFileSync("qpdf", ["--check", file], { stdio: "pipe" });
    assert.equal(Number(execFileSync("qpdf", ["--show-npages", file], { encoding: "utf8" }).trim()), pages);
}

async function verifyModes(folder, photo) {
    for (const mode of ["combined", "separate"]) {
        const settingsFile = config(folder, mode);
        for (let round = 0; round < ROUNDS; round += 1) {
            const dir = fs.mkdtempSync(path.join(folder, `${mode}-`));
            const first = path.join(dir, "A é photo.png");
            const second = path.join(dir, "-B's photo.png");
            fs.copyFileSync(photo, first);
            fs.copyFileSync(photo, second);
            const base = mode === "combined" ? "Images 2026-10-29 at 01.23.45.pdf" : "A é photo.pdf";
            fs.mkdirSync(path.join(dir, base));
            const args = ["--settings", pathToFileURL(settingsFile).href, "--", path.basename(first), path.basename(second)];
            // Both exact artifacts race the same occupied name and the same first suffix.
            // eslint-disable-next-line no-await-in-loop
            const pair = await Promise.all([cli(args, dir), cli(args, dir)]);
            const docs = pair.flatMap((stdout) => parseReceipt(stdout).documents);
            assert.equal(docs.length, mode === "combined" ? 2 : 4);
            assert.equal(new Set(docs.map((document) => document.output)).size, docs.length);
            assert.ok(fs.statSync(path.join(dir, base)).isDirectory());
            for (const document of docs) {
                assert.equal(document.state, "saved");
                assert.ok(document.sources.every((file) => [first, second].includes(file)));
                assert.ok(fs.readdirSync(dir).includes(path.basename(document.output)));
                verifyPdf(document.output, mode === "combined" ? 2 : 1);
            }
            assert.deepEqual(fs.readFileSync(first), fs.readFileSync(photo));
            assert.deepEqual(fs.readFileSync(second), fs.readFileSync(photo));
            assert.ok(!fs.readdirSync(dir).some((name) => name.startsWith(".ImageFilesToPDF-")));
        }
    }
}

async function verifyFormats(folder, photo) {
    const inputs = [photo];
    for (const extension of ["jpg", "tif", "webp"]) {
        const file = path.join(folder, `image.${extension}`);
        execFileSync("vips", ["copy", photo, file], { stdio: "pipe" });
        inputs.push(file);
    }
    const fixtures = process.env.IFTP_HEVC_UNAVAILABLE ? { avif: heifFixtures.avif } : heifFixtures;
    for (const [extension, bytes] of Object.entries(fixtures)) {
        const file = path.join(folder, `image.${extension}`);
        fs.writeFileSync(file, bytes);
        inputs.push(file);
    }
    const expectedBytes = inputs.map((file) => fs.readFileSync(file));
    const reply = parseReceipt(await cli(["--settings", config(folder), "--", ...inputs], folder));
    assert.equal(reply.state, "complete");
    verifyPdf(reply.documents[0].output, inputs.length);
    inputs.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), expectedBytes[index]));
}

async function verifyHevcRefusal(folder) {
    const file = path.join(folder, "unsupported codec.heic");
    fs.writeFileSync(file, heifFixtures.heic);
    const result = parseReceipt(await cli(["--settings", config(folder), "--", file], folder, 1));
    const [record] = result.documents;
    assert.equal(record.state, "failed");
    assert.ok(!fs.existsSync(path.join(folder, "unsupported codec.pdf")));
    assert.deepEqual(fs.readFileSync(file), heifFixtures.heic);
    process.stdout.write(`Pinned libvips HEVC capability check: ${JSON.stringify(record.issues)}\n`);
}

async function verifyPngCounts(folder) {
    const settingsFile = config(folder);
    const fixtures = pngFixtures();
    const files = Object.fromEntries(Object.keys(fixtures).map((key) => [key, path.join(folder, `${key}.png`)]));
    for (const [key, bytes] of Object.entries(fixtures)) { fs.writeFileSync(files[key], bytes); }
    const args = ["--settings", settingsFile, "--", ...Object.values(files)];
    const result = parseReceipt(await cli(args, folder, 1));
    assert.equal(result.documents.length, 1);
    assert.deepEqual(result.documents[0].sources, [files.single]);
    const codes = Object.fromEntries(result.rejected.map((item) => [path.basename(item.path, ".png"), item.code]));
    assert.deepEqual(codes, { malformed: "damaged", multiple: "multiple-images", separateDefault: "multiple-images" });
    verifyPdf(result.documents[0].output, 1);
    for (const [key, bytes] of Object.entries(fixtures)) { assert.deepEqual(fs.readFileSync(files[key]), bytes); }
}

async function verifyNamespace(folder, photo) {
    const scope = path.join(folder, "namespace");
    fs.mkdirSync(scope);
    const jpeg = path.join(scope, "Photo.jpg");
    const png = path.join(scope, "photo.png");
    execFileSync("vips", ["copy", photo, jpeg]);
    fs.copyFileSync(photo, png);
    const probe = path.join(scope, "name");
    fs.mkdirSync(probe);
    const matches = fs.existsSync(path.join(scope, "NAME"));
    const separate = config(folder, "separate");
    const result = parseReceipt(await cli(["--settings", separate, "--", jpeg, png], folder));
    const expected = matches ? ["Photo-jpg.pdf", "photo-png.pdf"] : ["Photo.pdf", "photo.pdf"];
    assert.deepEqual(result.documents.map((document) => path.basename(document.output)).sort(), expected.sort());
}

async function verifyExtensionCollisions(folder, photo) {
    const separate = config(folder, "separate");
    const same = path.join(folder, "same extension");
    const mixed = path.join(folder, "mixed extensions");
    for (const [parent, names] of [[same, ["inner.png", "inner.png"]], [mixed, ["a.png", "a.jpg", "a.png"]]]) {
        for (const [index, name] of names.entries()) {
            const child = path.join(parent, String(index));
            fs.mkdirSync(child, { recursive: true });
            fs.copyFileSync(photo, path.join(child, name));
        }
    }
    const expected = [[same, ["inner.pdf", "inner 2.pdf"]], [mixed, ["a-png.pdf", "a-jpg.pdf", "a-png 2.pdf"]]];
    for (const [parent, names] of expected) {
        // Keep the conversions independent and check output paths in plan order.
        // eslint-disable-next-line no-await-in-loop
        const reply = parseReceipt(await cli(["--settings", separate, "--", parent], folder));
        assert.deepEqual(reply.documents.map((document) => path.basename(document.output)), names);
        for (const document of reply.documents) { verifyPdf(document.output, 1); }
    }
}

async function verifyLinkRefusal(folder, photo) {
    const outside = path.join(folder, "outside");
    const selected = path.join(folder, "selected");
    fs.mkdirSync(outside);
    fs.mkdirSync(selected);
    fs.copyFileSync(photo, path.join(outside, "outside.png"));
    const source = path.join(selected, "inside.png");
    fs.copyFileSync(photo, source);
    const link = path.join(selected, "linked");
    fs.symlinkSync(outside, link, windows ? "junction" : "dir");
    const combined = config(folder);
    const result = parseReceipt(await cli(["--settings", combined, "--", selected], folder));
    assert.deepEqual(result.documents[0].sources, [source]);
    const refusal = parseReceipt(await cli(["--settings", combined, "--", path.join(link, "outside.png")], folder, 1));
    assert.equal(refusal.rejected[0].code, "link");
    assert.ok(!fs.existsSync(path.join(outside, "outside.pdf")));
}

async function verifyMacPackages(folder, photo) {
    const selected = path.join(folder, "native packages");
    fs.mkdirSync(selected);
    const pixel = path.join(selected, "visible.png");
    fs.copyFileSync(photo, pixel);
    for (const name of ["Proj.xcodeproj", "Song.band", "Lib.photoslibrary"]) {
        const bundle = path.join(selected, name);
        fs.mkdirSync(bundle);
        fs.copyFileSync(photo, path.join(bundle, "inner.png"));
    }
    const input = selected.replace(/^\/private(?=\/var\/)/u, "");
    const result = parseReceipt(await cli(["--settings", config(folder), "--", input], folder));
    assert.deepEqual(result.documents[0].sources, [path.join(input, "visible.png")]);
    verifyPdf(result.documents[0].output, 1);
    assert.ok(!fs.existsSync(path.join(selected, "inner.pdf")));
    process.stdout.write("macOS skipped xcodeproj, band and photoslibrary packages.\n");
}

async function verifyTransport(folder, photo) {
    const configFile = config(folder);
    const plain = await run(process.execPath, [artifact, "--settings", configFile, photo], { cwd: folder, encoding: "utf8" });
    const [saved] = parseReceipt(plain.stdout).documents;
    assert.deepEqual(saved.sources, [photo]);
    assert.ok(plain.stderr.includes(path.dirname(saved.output) + path.sep));
    verifyPdf(saved.output, 1);
    const broken = parseReceipt(await cli(["--settings", configFile, "--unknown", photo], folder, 2));
    assert.equal(broken.issues[0].code, "usage");
    const setup = parseReceipt(await cli(["--settings", configFile, "--", photo], folder, 3,
        { env: { ...process.env, IMAGE_FILES_TO_PDF_VIPS: path.join(folder, "missing.exe") } }));
    assert.equal(setup.state, "setup-failed");

    const output = path.join(folder, "broken stream.pdf");
    const source = path.join(folder, "broken stream.png");
    fs.copyFileSync(photo, source);
    const child = spawn(process.execPath, [artifact, "--settings", configFile, "--", source], { cwd: folder });
    child.stdout.destroy();
    child.stderr.setEncoding("utf8");
    let errors = "";
    child.stderr.on("data", (text) => { errors += text; });
    const status = await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
    assert.equal(status, 1, errors);
    assert.match(errors, /Standard output could not be completed\./u);
    verifyPdf(output, 1);
}

async function verifySecondVolume(folder, photo, secondVolume) {
    const first = fs.statSync(folder).dev;
    const second = fs.statSync(secondVolume).dev;
    assert.notEqual(first, second, "the cross-volume probe must use a separate device");
    using target = fs.mkdtempDisposableSync(path.join(secondVolume, "iftp-cross-"));
    for (const mode of ["combined", "separate"]) {
        const inputName = `cross-volume-${mode}.png`;
        const source = path.join(target.path, inputName);
        fs.copyFileSync(photo, source);
        const base = inputName.replace(/\.png$/u, ".pdf");
        const intended = path.join(target.path, base);
        if (process.env.IFTP_CARD_VOLUME) { fs.writeFileSync(intended, "occupied", { flag: "wx" }); }
        // Sequentially exercise both modes against the same physical volume.
        // eslint-disable-next-line no-await-in-loop
        const result = parseReceipt(await cli(["--settings", config(folder, mode), "--", source], folder));
        assert.equal(result.documents[0].state, "saved");
        verifyPdf(result.documents[0].output, 1);
        assert.deepEqual(fs.readFileSync(source), fs.readFileSync(photo));
        if (process.env.IFTP_CARD_VOLUME) {
            assert.equal(fs.readFileSync(intended, "utf8"), "occupied");
            assert.equal(result.documents[0].output, path.join(target.path, base.replace(/\.pdf$/u, " 2.pdf")));
        } else { assert.equal(result.documents[0].output, intended); }
    }
    assert.ok(!fs.readdirSync(target.path).some((name) => name.startsWith(".ImageFilesToPDF-")));
    process.stdout.write(`Exclusive cross-volume publication passed in both modes (${process.env.IFTP_CARD_VOLUME ?? "normal volume"}).\n`);
}

async function verifyWindowsLongArguments(folder, photo) {
    const input = path.join(folder, "long-argv");
    fs.mkdirSync(input);
    const filenames = Array.from({ length: 160 }, (unused, index) =>
        path.join(input, `${String(index).padStart(3, "0")}${"n".repeat(138)} photo.png`));
    assert.ok(filenames.reduce((units, file) => units + file.length + 1, 0) > 32767);
    for (const file of filenames) { fs.copyFileSync(photo, file); }
    const result = parseReceipt(await cli(["--settings", config(folder), "--", input], folder, 0, { timeout: 900000 }));
    const [document] = result.documents;
    assert.deepEqual(document.sources, filenames);
    verifyPdf(document.output, filenames.length);
    for (const file of filenames) { assert.deepEqual(fs.readFileSync(file), fs.readFileSync(photo)); }
    process.stdout.write("Windows converted a source list exceeding one native command line.\n");
}

async function verifySelection(folder, photo) {
    await verifyNamespace(folder, photo);
    await verifyExtensionCollisions(folder, photo);
    await verifyLinkRefusal(folder, photo);
    if (process.platform === "darwin") { await verifyMacPackages(folder, photo); }
}

async function main() {
    const directory = fs.realpathSync(os.tmpdir());
    using work = fs.mkdtempDisposableSync(path.join(directory, "iftp-native-"));
    const photo = path.join(work.path, "fixture.png");
    execFileSync("vips", ["black", photo, "64", "48", "--bands", "3"], { stdio: "pipe" });
    if (process.env.IFTP_LONG_WINDOWS_ONLY) { await verifyWindowsLongArguments(work.path, photo); return; }
    if (process.env.IFTP_CROSS_VOLUME_ONLY) {
        assert.ok(process.env.IFTP_SECOND_VOLUME, "A distinct target device is required.");
        await verifySecondVolume(work.path, photo, process.env.IFTP_SECOND_VOLUME);
        return;
    }
    await verifyFormats(work.path, photo);
    if (process.env.IFTP_HEVC_UNAVAILABLE) { await verifyHevcRefusal(work.path); }
    await verifyPngCounts(work.path);
    await verifySelection(work.path, photo);
    await verifyModes(work.path, photo);
    await verifyTransport(work.path, photo);
    if (process.env.IFTP_SECOND_VOLUME) { await verifySecondVolume(work.path, photo, process.env.IFTP_SECOND_VOLUME); }
    else { process.stdout.write("Second-volume check requires IFTP_SECOND_VOLUME.\n"); }
    assert.equal(fileURLToPath(pathToFileURL(photo)), photo);
    process.stdout.write(`Native CLI on ${process.platform}/${process.arch} Node ${process.version}: still formats, ${ROUNDS} races per mode, Unicode, strict PDF checks, malformed request, unusable override and broken receipt.\n`);
}
main().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
