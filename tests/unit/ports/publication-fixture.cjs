"use strict";
const { createConversionFixture } = require("./fake-conversion.cjs");
const { makeJob } = require("./fake-job.cjs");
const staged = "/work/ready.pdf";
const target = "/out/result.pdf";
function fixture(options = {}) {
    const app = createConversionFixture({ files: [staged], ...options });
    const job = makeJob(app);
    job.artifacts.set(staged,{path:staged,state:"validated"});
    return { app, job };
}

module.exports = { fixture, staged, target };
