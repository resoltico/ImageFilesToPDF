import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { FAST_CHECK_SETTINGS, unitScope, propertyTestFiles, unitTestFiles } from "./pure-modules.mjs";
import { lcovGaps } from "./coverage.mjs";

const FUZZ_RUNS = 2000;

const record = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "iftp-coverage-")), "unit.lcov");
const coverage = [
    "--require", FAST_CHECK_SETTINGS,
    "--test", "--experimental-test-coverage",
    ...unitScope.map((pattern) => `--test-coverage-include=${pattern}`),
    "--test-reporter=spec", "--test-reporter-destination=stdout",
    "--test-reporter=lcov", `--test-reporter-destination=${record}`,
    ...unitTestFiles
];
const fuzz = ["--require", FAST_CHECK_SETTINGS, "--test", ...propertyTestFiles];
const mutation = [
    path.resolve("node_modules/@stryker-mutator/core/bin/stryker.js"), "run", "--mutate", unitScope.join(",")
];

const [, , gate, ...extra] = process.argv;
const commands = { coverage, fuzz, mutation };
if (!Object.hasOwn(commands, gate)) { throw new Error(`Unknown unit gate: ${gate}`); }
// One seed for every test process of this run, printed so a failure reproduces.
const { commitSeed } = createRequire(import.meta.url)(path.resolve(FAST_CHECK_SETTINGS));
const seed = process.env.IFTP_FC_SEED ?? String(commitSeed());
const runs = gate === "fuzz" ? String(FUZZ_RUNS) : process.env.IFTP_FC_RUNS;
if (gate !== "mutation") { process.stdout.write(`fast-check seed ${seed}${runs ? `, ${runs} cases per property` : ""}\n`); }
const env = { ...process.env, IFTP_FC_SEED: seed, ...(runs ? { IFTP_FC_RUNS: runs } : {}) };
const result = spawnSync(process.execPath, [...commands[gate], ...extra], { stdio: "inherit", env });
if (result.error) { throw result.error; }
process.exitCode = result.status ?? 1;

// The tests passing is not enough: every file in scope must be wholly covered.
const gaps = gate === "coverage" && process.exitCode === 0
    ? lcovGaps(fs.readFileSync(record, "utf8"), process.cwd(), fs.globSync(unitScope))
    : [];
fs.rmSync(path.dirname(record), { recursive: true });
if (gaps.length > 0) {
    process.stderr.write(`Unit coverage is not complete:\n${gaps.map((gap) => `  ${gap}`).join("\n")}\n`);
    process.exitCode = 1;
}
