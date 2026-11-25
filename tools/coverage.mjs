import path from "node:path";

/*
 * The coverage rule both coverage gates hold: every file in scope was loaded,
 * and every line, branch and function in it ran. Node's own thresholds judge
 * only the files a test happened to load, so a module nothing requires would
 * pass them; the scope is therefore matched against the record here.
 *
 * Records are lcov as Node writes it. Paths are made relative to the checkout
 * on the machine that wrote them, so records from different machines merge.
 */

// Node numbers branches through the whole file, and skips the inner branches
// of a function that never ran. Within one line the order is stable, so a
// branch is known by its line and its place on that line.
function emptyRecord() {
    return { lines: new Map(), branches: new Map(), functions: new Map() };
}

function add(map, key, hits) {
    map.set(key, (map.get(key) ?? 0) + hits);
}

export function parseLcov(text, root) {
    const files = new Map();
    let record = null;
    let names = new Map();
    let ordinals = new Map();
    for (const line of text.split(/\r?\n/u)) {
        const separator = line.indexOf(":");
        const [tag, value] = separator === -1 ? [line, ""] : [line.slice(0, separator), line.slice(separator + 1)];
        if (tag === "SF") {
            const file = path.relative(root, value).split(path.sep).join("/");
            record = files.get(file) ?? emptyRecord();
            files.set(file, record);
            names = new Map();
            ordinals = new Map();
        } else if (tag === "FN") {
            const [at, ...name] = value.split(",");
            names.set(name.join(","), Number(at));
        } else if (tag === "FNDA") {
            const [hits, ...name] = value.split(",");
            const key = name.join(",");
            add(record.functions, `${names.get(key)}:${key}`, Number(hits));
        } else if (tag === "DA") {
            const [at, hits] = value.split(",");
            add(record.lines, Number(at), Number(hits));
        } else if (tag === "BRDA") {
            const [at, , , hits] = value.split(",");
            const ordinal = ordinals.get(at) ?? 0;
            ordinals.set(at, ordinal + 1);
            add(record.branches, `${at}:${ordinal}`, hits === "-" ? 0 : Number(hits));
        }
    }
    return files;
}

export function mergeCoverage(records) {
    const merged = new Map();
    for (const files of records) {
        for (const [file, record] of files) {
            const target = merged.get(file) ?? emptyRecord();
            merged.set(file, target);
            for (const kind of ["lines", "branches", "functions"]) {
                for (const [key, hits] of record[kind]) { add(target[kind], key, hits); }
            }
        }
    }
    return merged;
}

const atLine = (key) => Number(String(key).split(":")[0]);

function recordGaps(file, record) {
    if (!record) { return [`${file}: never loaded by a test`]; }
    const unrun = (kind) => [...record[kind]].filter(([, hits]) => hits === 0).map(([key]) => key);
    return [
        ...unrun("lines").map((key) => [atLine(key), "line not run"]),
        ...unrun("branches").map((key) => [atLine(key), "branch not taken"]),
        ...unrun("functions").map((key) => [atLine(key), `function ${key.slice(key.indexOf(":") + 1)} never called`])
    ].sort(([first], [second]) => first - second).map(([line, what]) => `${file}:${line}: ${what}`);
}

/** Every way the record falls short of the scope, one line each, in file and line order. */
export function coverageGaps(coverage, files) {
    return [...files].sort().flatMap((file) => recordGaps(file, coverage.get(file)));
}
