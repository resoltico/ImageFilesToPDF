"use strict";

/*
 * fast-check's settings for ordinary test runs and the fuzz gate.
 *
 * The seed comes from IFTP_FC_SEED when set, otherwise from the commit being
 * tested, so a CI failure reproduces from its commit alone while every new
 * commit explores new inputs; fast-check names the seed in any failure, and
 * the unit gates print it before they start. A
 * counterexample a run finds becomes an explicit case before the fix, so the
 * input that broke the code is tested on every run after it.
 *
 * IFTP_FC_RUNS sets the case count: fast-check's default for ordinary runs,
 * and more for `npm run test:fuzz`. Mutation campaigns use their own fixed
 * settings (tests/unit/fast-check-mutation.cjs).
 */

const { execFileSync } = require("node:child_process");
const fc = require("fast-check");

const HEX = 16;
const SEED_DIGITS = 8;
const DEFAULT_RUNS = 100;

function commitSeed() {
    try {
        const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        return Number.parseInt(head.slice(0, SEED_DIGITS), HEX);
    } catch {
        return Date.now() % (2 ** 31);
    }
}

const seed = process.env.IFTP_FC_SEED ? Number(process.env.IFTP_FC_SEED) : commitSeed();
const numRuns = process.env.IFTP_FC_RUNS ? Number(process.env.IFTP_FC_RUNS) : DEFAULT_RUNS;
if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(numRuns) || numRuns < 1) {
    throw new Error("IFTP_FC_SEED and IFTP_FC_RUNS must be integers, and the run count positive.");
}
fc.configureGlobal({ seed, numRuns });

module.exports = { commitSeed };
