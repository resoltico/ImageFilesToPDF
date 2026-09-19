"use strict";

/*
 * fast-check's settings while a mutation campaign runs, and only then.
 *
 * Everywhere else the properties run on fast-check's own defaults: a fresh
 * seed each run and a hundred cases, so the inputs they try keep changing from
 * one run to the next. A failure is reproducible without a fixed seed, because
 * fast-check reports the seed it used and the smallest counterexample it could
 * shrink to.
 *
 * A campaign is different. It runs the suite once per mutant, thousands of
 * times, and a mutant that one seed kills and another does not would make the
 * score a matter of luck. So under it the seed is fixed and the count is kept
 * small: the same inputs against every mutant, at a cost multiplied by all of
 * them. Stryker's tap runner loads this with `-r`; see stryker.config.json.
 */

const fc = require("fast-check");

fc.configureGlobal({ seed: 20260916, numRuns: 25 });
