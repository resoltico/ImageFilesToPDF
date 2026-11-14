"use strict";
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");
const staged = "/work/ready.pdf";
const target = "/out/result.pdf";
function fixture(options = {}) {
    const app = createFakeHost({ files: [staged], ...options });
    const job = makeJob(app);
    job.artifacts.set(staged,{path:staged,state:"validated"});
    return { app, job };
}

module.exports = { fixture, staged, target };
