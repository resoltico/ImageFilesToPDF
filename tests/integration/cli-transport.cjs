"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseReceipt } = require("./lib/receipt.cjs");
const { execFileSync, spawnSync } = require("node:child_process");
const [artifact, work] = process.argv.slice(2);
const outputFailure = "Standard output could not be completed.";

function fixture(name) {
    const folder = path.join(work, name); fs.mkdirSync(folder);
    const output = path.join(folder, "photo.pdf"), source = path.join(folder, "photo.jpg");
    fs.copyFileSync(path.join(work, "photo.jpg"), source);
    const configuration = path.join(folder, "settings.json");
    fs.writeFileSync(configuration, JSON.stringify({ mode: "combined", paperSize: "A4", orientation: "Portrait", resolutionLimit: 300, quality: 92, background: "#FFFFFF" }));
    return { source, output, bytes: fs.readFileSync(source), args: [artifact, "--headless", configuration, source] };
}

function verified(result, sample) {
    assert.ifError(result.error);
    assert.deepEqual(fs.readFileSync(sample.source), sample.bytes, "transport failure never changes the source");
    execFileSync("pdfcpu", ["validate", "--conf", "disable", "--mode=strict", sample.output], { stdio: "pipe" });
    execFileSync("qpdf", ["--check", sample.output], { stdio: "pipe" });
}

function failedOutput(result, sample) {
    verified(result, sample);
    assert.equal(result.status, 1, result.stderr); assert.equal(result.signal, null, result.stderr);
    assert.match(result.stderr, /^Created 1 PDF\./u);
    assert.equal(result.stderr.split(outputFailure).length - 1, 1, result.stderr);
    assert.ok(result.stderr.endsWith(`${outputFailure}\n`));
    assert.doesNotMatch(result.stderr, /execution error|\(-2700\)|\n\s+at \w|"diagnostic"/u);
}

function withBrokenPipe(name, use) {
    const fifo = path.join(work, name); execFileSync("mkfifo", [fifo]);
    // Open both ends without blocking, then close the only reader BEFORE exec.
    // Unlike /dev/null or a racing head process, the first child write is EPIPE.
    // eslint-disable-next-line no-bitwise -- POSIX open flags are independent bitmasks.
    const reader = fs.openSync(fifo, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    // eslint-disable-next-line no-bitwise -- POSIX open flags are independent bitmasks.
    const writer = fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK);
    fs.closeSync(reader);
    try { return use(writer); }
    finally { fs.closeSync(writer); }
}

const closed = fixture("closed-stdout");
const closedResult = spawnSync("/bin/sh", ["-c", 'exec 1>&-; exec /usr/bin/osascript -l JavaScript "$@"', "closed-stdout", ...closed.args],
    { encoding: "utf8", timeout: 30000, killSignal: "SIGKILL" });
failedOutput(closedResult, closed); assert.equal(closedResult.stdout, "");

const pipe = fixture("broken-stdout");
const pipeResult = withBrokenPipe("output-pipe", (descriptor) => spawnSync("/usr/bin/osascript", ["-l", "JavaScript", ...pipe.args],
    { encoding: "utf8", stdio: ["ignore", descriptor, "pipe"], timeout: 30000, killSignal: "SIGKILL" }));
failedOutput(pipeResult, pipe);

const prose = fixture("broken-stderr");
const proseResult = withBrokenPipe("report-pipe", (descriptor) => spawnSync("/usr/bin/osascript", ["-l", "JavaScript", ...prose.args],
    { encoding: "utf8", stdio: ["ignore", "pipe", descriptor], timeout: 30000, killSignal: "SIGKILL" }));
verified(proseResult, prose);
assert.ok(proseResult.status !== 0 || proseResult.signal !== null, "the first transport refusal remains nonzero");
const receipt = parseReceipt(proseResult.stdout);
assert.equal(receipt.state, "complete"); assert.equal(receipt.documents[0].output, prose.output);
// eslint-disable-next-line no-console
console.log("macOS CLI transport passed: closed output, prebroken output pipe, prebroken report pipe and published/source integrity");
