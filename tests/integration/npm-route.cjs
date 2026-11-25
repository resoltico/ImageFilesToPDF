"use strict";
/*
 * The npm route on POSIX: install the packed tarball globally into a private
 * prefix, run the command npm puts on PATH, and uninstall it.
 *
 * Usage: node tests/integration/npm-route.cjs <image-files-to-pdf-x.y.z.tgz>
 * The tarball comes from tools/npm-package.mjs; packing stays outside so the
 * same tarball can be installed by whichever npm the host's Node ships.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { assertReceipt, parseReceipt } = require("./lib/receipt.cjs");

const quiet = { ...process.env, "npm_config_audit": "false", "npm_config_fund": "false", "npm_config_update_notifier": "false" };
const SETTINGS = { mode: "separate", paperSize: "A4", orientation: "Portrait", resolutionLimit: 300, quality: 82, background: "#FFFFFF" };

function packageVersion(tarball) {
    assert.ok(fs.statSync(tarball).isFile(), "pass the packed npm tarball");
    const version = /image-files-to-pdf-(?<version>\d+\.\d+\.\d+(?:-[\w.]+)?)\.tgz$/u.exec(tarball)?.groups.version;
    assert.ok(version, "the tarball name carries the package version");
    return version;
}

function runner(command, cwd) {
    return (args, options = {}) => spawnSync(command, args, { encoding: "utf8", cwd, timeout: 60000, ...options });
}

function verifyCommand(run, version) {
    const versionRun = run(["--version"]);
    assert.equal(versionRun.status, 0, versionRun.stderr);
    assert.equal(versionRun.stdout, `Image Files to PDF ${version}\n`);
    const help = run(["-h"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /^ {2}image-files-to-pdf --settings <settings\.json> \[--\] <path…>$/mu);
    assert.doesNotMatch(help.stdout, /Image-Files-to-PDF\.cjs/u);
}

function verifyConversion(run, folder) {
    const photo = path.join(folder, "photo.png");
    execFileSync("vips", ["black", photo, "64", "48", "--bands", "3"]);
    const settings = path.join(folder, "settings.json");
    fs.writeFileSync(settings, JSON.stringify(SETTINGS));
    const converted = run(["--settings", settings, photo]);
    assert.equal(converted.status, 0, converted.stderr);
    const receipt = parseReceipt(converted.stdout);
    assertReceipt(receipt);
    assert.equal(receipt.state, "complete");
    execFileSync("pdfcpu", ["validate", "--mode=strict", receipt.documents[0].output], { stdio: "pipe" });
    return { photo, settings };
}

// PATH holds only a link to node, which the command's shebang needs, so every
// conversion tool is missing even where node shares a directory with them.
function verifyMissingTools(run, folder, { photo, settings }) {
    const nodeOnly = path.join(folder, "node-only");
    fs.mkdirSync(nodeOnly);
    fs.symlinkSync(process.execPath, path.join(nodeOnly, "node"));
    const bare = run(["--settings", settings, photo], { env: { ...quiet, PATH: nodeOnly } });
    assert.equal(bare.status, 3, bare.stderr);
    const refused = parseReceipt(bare.stdout);
    assertReceipt(refused);
    assert.deepEqual(refused.issues.map(({ code }) => code), ["tool-missing", "tool-missing", "tool-missing", "install-hint"]);
}

function main(tarball) {
    const version = packageVersion(tarball);
    using work = fs.mkdtempDisposableSync(path.join(fs.realpathSync(os.tmpdir()), "iftp-npm-route-"));
    const prefix = path.join(work.path, "prefix");
    const command = path.join(prefix, "bin", "image-files-to-pdf");
    execFileSync("npm", ["install", "--global", "--prefix", prefix, tarball], { env: quiet, stdio: "pipe" });
    assert.equal(path.basename(fs.realpathSync(command)), "Image-Files-to-PDF.cjs", "npm links the command to the CLI artifact");
    const run = runner(command, work.path);
    verifyCommand(run, version);
    verifyMissingTools(run, work.path, verifyConversion(run, work.path));
    execFileSync("npm", ["uninstall", "--global", "--prefix", prefix, "image-files-to-pdf"], { env: quiet, stdio: "pipe" });
    assert.equal(fs.existsSync(command), false, "uninstall removes the command");
    process.stdout.write(`npm route passed on ${process.platform} ${process.arch}: install, --version, help, conversion, missing tools and uninstall for ${version}.\n`);
}

main(path.resolve(process.argv[2] ?? ""));
