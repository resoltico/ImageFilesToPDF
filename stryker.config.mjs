/*
 * Mutation testing of the unit scope (tools/pure-modules.mjs), run
 * by tools/unit-gate.mjs, which passes the modules to mutate.
 */
import { unitTestFiles } from "./tools/pure-modules.mjs";

export default {
    packageManager: "npm",
    /*
     * The tap runner executes each test file directly (node <file>), which keeps
     * it in the same process as Stryker's coverage hook. Running them through
     * `node --test` forks a child per file, the hook records nothing, and every
     * mutant reports NoCoverage.
     */
    testRunner: "tap",
    coverageAnalysis: "perTest",
    reporters: ["html", "json", "clear-text", "progress"],
    htmlReporter: { fileName: "reports/mutation/index.html" },
    jsonReporter: { fileName: "reports/mutation/report.json" },
    clearTextReporter: { maxTestsToLog: 0 },
    /*
     * Incremental mode stays off. A full run takes about 13 minutes locally and
     * 15 on CI, but an incremental run reuses results for tests and mutants it
     * judges unchanged, and a stale reuse would let a survivor pass unseen.
     */
    incremental: false,
    // Every mutant must be killed. An equivalent mutant is removed by simplifying
    // the code that admits it, not tolerated by a threshold.
    thresholds: { high: 100, low: 100, break: 100 },
    tempDirName: ".stryker-tmp",
    timeoutMS: 20000,
    tap: {
        /*
         * The fast-check settings file pins the seed and the case count for a
         * campaign only, so every mutant meets the same inputs. See
         * tests/unit/fast-check-mutation.cjs.
         */
        nodeArgs: ["-r", "./tests/unit/fast-check-mutation.cjs", "--test-reporter=tap"],
        testFiles: unitTestFiles
    }
};
