import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * The coverage rule both coverage gates hold: every file in scope was loaded,
 * and every line, branch and function in it ran. Node's own thresholds judge
 * only the files a test happened to load, so a module nothing requires would
 * pass them; the scope is therefore matched against the record here.
 *
 * The unit gate reads the lcov Node's test runner writes. The native suites run
 * as many processes on several machines, each leaving raw V8 coverage in
 * NODE_V8_COVERAGE; those are read here as the stretches of source that ran,
 * which is what merges. Counts do not: V8 leaves out a block whose count equals
 * its parent's, so one process's zero can be another's unreported run.
 */

const relativeTo = (root, file) => path.relative(root, file).split(path.sep).join("/");

function recordGaps(file, missed) {
    if (!missed) { return [`${file}: never loaded by a test`]; }
    return missed.toSorted(([first], [second]) => first - second).map(([line, what]) => `${file}:${line}: ${what}`);
}

// Every way the records fall short of the scope, one line each, in file and line order.
function gapsOf(shortfalls, files) {
    return [...files].sort().flatMap((file) => recordGaps(file, shortfalls.get(file)));
}

// lcov from Node's test runner: what ran no times, by line, per file.
export function parseLcov(text, root) {
    const files = new Map();
    let missed = null;
    let names = new Map();
    for (const line of text.split(/\r?\n/u)) {
        const separator = line.indexOf(":");
        const [tag, value] = separator === -1 ? [line, ""] : [line.slice(0, separator), line.slice(separator + 1)];
        const [first, ...rest] = value.split(",");
        if (tag === "SF") {
            missed = [];
            files.set(relativeTo(root, value), missed);
            names = new Map();
        } else if (tag === "FN") {
            names.set(rest.join(","), Number(first));
        } else if (tag === "FNDA" && first === "0") {
            missed.push([names.get(rest.join(",")), `function ${rest.join(",")} never called`]);
        } else if (tag === "DA" && rest[0] === "0") {
            missed.push([Number(first), "line not run"]);
        } else if (tag === "BRDA" && ["0", "-"].includes(rest[2])) {
            missed.push([Number(first), "branch not taken"]);
        }
    }
    return files;
}

/** The lcov record's shortfalls against the scope. */
export function lcovGaps(text, root, files) {
    return gapsOf(parseLcov(text, root), files);
}

/*
 * One process's run of one script: each position counts as the innermost range
 * holding it, so painting the ranges from the widest in leaves exactly the
 * positions that ran.
 */
function paintRun(ran, functions) {
    const ranges = functions.flatMap((entry) => entry.ranges)
        .toSorted((first, second) => (second.endOffset - second.startOffset) - (first.endOffset - first.startOffset));
    for (const range of ranges) { ran.fill(range.count > 0 ? 1 : 0, range.startOffset, range.endOffset); }
}

function spans(ran) {
    const found = [];
    let start = ran.indexOf(1);
    while (start !== -1) {
        const end = ran.indexOf(0, start);
        found.push([start, end === -1 ? ran.length : end]);
        start = end === -1 ? -1 : ran.indexOf(1, end);
    }
    return found;
}

function addScript(record, functions) {
    const run = new Uint8Array(record.ran.length);
    paintRun(run, functions);
    run.forEach((value, index) => { if (value === 1) { record.ran[index] = 1; } });
    for (const entry of functions) {
        const [whole, ...blocks] = entry.ranges;
        // The script itself is the unnamed range at offset 0, not a function of the source.
        if (whole.startOffset > 0) { record.functions.set(whole.startOffset, entry.functionName || "(anonymous)"); }
        if (entry.isBlockCoverage) { for (const block of blocks) { record.branches.add(block.startOffset); } }
    }
}

/*
 * A directory of raw V8 coverage, as the source under root that ran: for each
 * file, the stretches that ran in any process, and where its branches and
 * functions begin.
 */
export function readV8Coverage(directory, checkout) {
    // V8 names scripts by their real paths.
    const root = fs.realpathSync(checkout);
    const files = new Map();
    for (const name of fs.readdirSync(directory).filter((entry) => entry.endsWith(".json")).sort()) {
        const { result } = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
        for (const script of result.filter(({ url }) => url.startsWith("file:"))) {
            const file = fileURLToPath(script.url);
            const relative = relativeTo(root, file);
            if (!relative.startsWith("../") && !path.isAbsolute(relative)) {
                if (!files.has(relative)) {
                    files.set(relative, { ran: new Uint8Array(fs.readFileSync(file, "utf8").length), branches: new Set(), functions: new Map() });
                }
                addScript(files.get(relative), script.functions);
            }
        }
    }
    return new Map([...files].map(([file, { ran, branches, functions }]) =>
        [file, { ran: spans(ran), branches: [...branches].sort((first, second) => first - second), functions: [...functions] }]));
}

// Records travel between jobs as JSON.
export function serializeCoverage(coverage) {
    return JSON.stringify(Object.fromEntries(coverage));
}

export function deserializeCoverage(text) {
    return new Map(Object.entries(JSON.parse(text)));
}

function lineStarts(source) {
    const starts = [0];
    for (let index = source.indexOf("\n"); index !== -1; index = source.indexOf("\n", index + 1)) { starts.push(index + 1); }
    return starts;
}

function lineAt(starts, offset) {
    return starts.findLastIndex((start) => start <= offset) + 1;
}

// One file across every record: a line ran if any of its code did; a branch or
// function ran if the place it begins did.
function sourceShortfalls(source, records) {
    const ran = new Uint8Array(source.length);
    for (const record of records) { for (const [start, end] of record.ran) { ran.fill(1, start, end); } }
    const starts = lineStarts(source);
    const missed = [];
    source.split("\n").forEach((text, index) => {
        const code = [...text.matchAll(/\S/gu)].map((match) => starts[index] + match.index);
        if (code.length > 0 && code.every((offset) => ran[offset] === 0)) { missed.push([index + 1, "line not run"]); }
    });
    for (const offset of new Set(records.flatMap((record) => record.branches))) {
        if (ran[offset] === 0) { missed.push([lineAt(starts, offset), "branch not taken"]); }
    }
    for (const [offset, name] of new Map(records.flatMap((record) => record.functions))) {
        if (ran[offset] === 0) { missed.push([lineAt(starts, offset), `function ${name} never called`]); }
    }
    return missed;
}

/** The shortfalls of every record together against the scope; readSource gives a file's text. */
export function nativeGaps(records, files, readSource) {
    const shortfalls = new Map();
    for (const file of files) {
        const held = records.map((coverage) => coverage.get(file)).filter(Boolean);
        if (held.length > 0) { shortfalls.set(file, sourceShortfalls(readSource(file), held)); }
    }
    return gapsOf(shortfalls, files);
}
