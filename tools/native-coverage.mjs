import fs from "node:fs";
import path from "node:path";
import { nativeExcluded, nativeScope } from "./pure-modules.mjs";
import { deserializeCoverage, nativeGaps, readV8Coverage, serializeCoverage } from "./coverage.mjs";

/*
 * Coverage of the native suites. A job runs its suites with NODE_V8_COVERAGE
 * set, after `source` has put the source in the artifact's place, then
 * `record` keeps what ran. The `gate` job merges every job's record and
 * requires the native scope to have run in full on some platform.
 *
 *   node tools/native-coverage.mjs source
 *   node tools/native-coverage.mjs record <v8-directory> <record.json>
 *   node tools/native-coverage.mjs gate <directory of records>
 */

const ARTIFACT = "dist/Image-Files-to-PDF.cjs";

const [, , command, ...args] = process.argv;
if (command === "source") {
    // The suites start the CLI by its artifact path; run the source behind that path.
    fs.writeFileSync(ARTIFACT, "\"use strict\";\nrequire(\"../src/cli/entry.js\");\n");
} else if (command === "record") {
    const [directory, record] = args;
    fs.writeFileSync(record, serializeCoverage(readV8Coverage(directory, process.cwd())));
} else if (command === "gate") {
    const [directory] = args;
    const records = fs.readdirSync(directory, { recursive: true }).filter((name) => name.endsWith(".json"))
        .map((name) => deserializeCoverage(fs.readFileSync(path.join(directory, name), "utf8")));
    if (records.length === 0) { throw new Error(`No coverage records in ${directory}`); }
    const files = fs.globSync(nativeScope).filter((file) => !nativeExcluded.includes(file));
    const gaps = nativeGaps(records, files, (file) => fs.readFileSync(file, "utf8"));
    process.stdout.write(`Native coverage from ${records.length} records over ${files.length} files.\n`);
    if (gaps.length > 0) {
        process.stderr.write(`Native coverage is not complete:\n${gaps.map((gap) => `  ${gap}`).join("\n")}\n`);
        process.exitCode = 1;
    }
} else {
    throw new Error(`Unknown native coverage command: ${command}`);
}
