import path from "node:path";
import { spawnSync } from "node:child_process";
import { purePatterns, unitTestFiles } from "./pure-modules.mjs";

const coverage = [
    "--test", "--experimental-test-coverage",
    ...purePatterns.map((pattern) => `--test-coverage-include=${pattern}`),
    "--test-coverage-lines=100", "--test-coverage-branches=100", "--test-coverage-functions=100",
    ...unitTestFiles
];
const mutation = [
    path.resolve("node_modules/@stryker-mutator/core/bin/stryker.js"), "run", "--mutate", purePatterns.join(",")
];

const [, , gate, ...extra] = process.argv;
const commands = { coverage, mutation };
if (!Object.hasOwn(commands, gate)) { throw new Error(`Unknown unit gate: ${gate}`); }
const result = spawnSync(process.execPath, [...commands[gate], ...extra], { stdio: "inherit" });
if (result.error) { throw result.error; }
process.exitCode = result.status ?? 1;
