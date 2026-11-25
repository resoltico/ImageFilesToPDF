import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { FAST_CHECK_SETTINGS, purePatterns, propertyTestFiles, unitTestFiles } from "./pure-modules.mjs";

const FUZZ_RUNS = 2000;

const coverage = [
    "--require", FAST_CHECK_SETTINGS,
    "--test", "--experimental-test-coverage",
    ...purePatterns.map((pattern) => `--test-coverage-include=${pattern}`),
    "--test-coverage-lines=100", "--test-coverage-branches=100", "--test-coverage-functions=100",
    ...unitTestFiles
];
const fuzz = ["--require", FAST_CHECK_SETTINGS, "--test", ...propertyTestFiles];
const mutation = [
    path.resolve("node_modules/@stryker-mutator/core/bin/stryker.js"), "run", "--mutate", purePatterns.join(",")
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
