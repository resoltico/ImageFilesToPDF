import path from "node:path";
import { parseScript } from "./javascript.mjs";

const PURE_LAYERS = ["core", "application", "backend"];
const PORT_LAYERS = new Set(["engine", "cli", "serve"]);
const DECLARED_FILES = [
    "src/finder/invocation-syntax.js",
    "src/cli/exit-code.js",
    "src/cli/grammar.js",
    "src/cli/paths.js",
    "src/engine/executables.js",
    "src/engine/path-syntax.js",
    "src/engine/platform/linux-paths.js",
    "src/engine/platform/helper-codec.js",
    "src/engine/platform/windows-helper.js",
    "src/serve/dialogue.js",
    "src/serve/interactions.js"
];
const VALUE_MODULES = new Set(["node:buffer", "node:path"]);
const HOST_GLOBALS = new Set(["process", "globalThis", "fetch", "setTimeout", "setInterval", "setImmediate", "Application", "ObjC", "$"]);

/*
 * The unit test set both gates measure with. Coverage and mutation must run the
 * same tests: code reached only by repository tests would count as covered in
 * one gate and as uncovered mutants in the other.
 */
export const unitTestFiles = ["tests/unit/**/*.test.cjs", "tools/tests/unit/**/*.test.cjs"];

// Property tests, which the fuzz gate runs with many more cases.
export const propertyTestFiles = ["tests/unit/**/*-properties.test.cjs"];

// Loaded into every unit test process: fast-check's seed and case count.
export const FAST_CHECK_SETTINGS = "./tests/unit/fast-check-seed.cjs";

export const purePatterns = [...PURE_LAYERS.map((layer) => `src/${layer}/**/*.js`), ...DECLARED_FILES];

function ambient(value) {
    if (!value || typeof value !== "object") { return false; }
    if (value.type === "Identifier" && HOST_GLOBALS.has(value.name)) { return true; }
    return Object.values(value).some(ambient);
}

function readsOnlyValues(file, sources, visiting = new Set()) {
    if (VALUE_MODULES.has(file) || PURE_LAYERS.includes(file.split("/")[1]) || visiting.has(file)) { return true; }
    const code = sources.get(file);
    if (!code || ambient(parseScript(code, "latest"))) { return false; }
    const next = new Set([...visiting, file]);
    for (const match of code.matchAll(/require\("(?<target>[^"]+)"\)/gu)) {
        const name = match.groups.target;
        const target = name.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(file), name)) : name;
        const resolved = !sources.has(target) && sources.has(`${target}.js`) ? `${target}.js` : target;
        if (!readsOnlyValues(resolved, sources, next)) { return false; }
    }
    return true;
}

export function checkPureModules(sources, declared = DECLARED_FILES) {
    const unlisted = [...sources.keys()].filter((file) => PORT_LAYERS.has(file.split("/")[1]) && readsOnlyValues(file, sources) && !declared.includes(file));
    if (unlisted.length > 0) { throw new Error(`Unlisted pure modules: ${unlisted.join(", ")}`); }
    const invalid = declared.filter((file) => !sources.has(file) || !readsOnlyValues(file, sources));
    if (invalid.length > 0) { throw new Error(`Listed pure modules require native I/O or are missing: ${invalid.join(", ")}`); }
}
