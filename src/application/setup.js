"use strict";
const { setupToolProblem, setupFailure } = require("../core/setup.js");
const { buildVipsProbeArgv, buildVipsheaderProbeArgv, isVipsheaderUsable, buildPdfcpuProbeArgv, isPdfcpuUsable } = require("../backend/preflight.js");

const REQUIRED_TOOLS = ["vips", "vipsheader", "pdfcpu"];

function probeArgv(name, file, sample) {
    if (name === "pdfcpu") { return buildPdfcpuProbeArgv(file); }
    if (name === "vipsheader") { return [...buildVipsheaderProbeArgv(file), sample.input]; }
    const args = buildVipsProbeArgv(file);
    const firstPath = 2;
    const pathCount = 2;
    args.splice(firstPath, pathCount, sample.input, sample.output);
    return args;
}

function probeAccepted(name, result, sample) {
    if (result.status !== 0 || result.error) { return false; }
    if (name === "pdfcpu") { return isPdfcpuUsable(result.stdout); }
    if (name === "vipsheader") { return isVipsheaderUsable(result.stdout); }
    return sample.outputExists();
}

function checkedTool(ports, name, found) {
    if (!found.file) { return setupToolProblem(found.override ? "override-invalid" : "tool-missing", name, found.override); }
    const inspect = async (sample) => {
        const result = await ports.run(probeArgv(name, found.file, sample));
        ports.checkpoint();
        if (probeAccepted(name, result, sample)) { return null; }
        const issue = setupToolProblem("tool-unusable", name, found.override);
        return { ...issue, diagnostic: { tool: name, path: found.file, status: result.status, message: result.error || result.stderr || result.stdout } };
    };
    return name === "pdfcpu" ? inspect(null) : ports.withSample(inspect);
}

async function checkRequiredTools(ports) {
    const tools = {};
    const issues = [];
    for (const name of REQUIRED_TOOLS) {
        ports.checkpoint();
        // eslint-disable-next-line no-await-in-loop -- Capability probes run one at a time before any source is opened.
        const found = await ports.locate(name);
        // eslint-disable-next-line no-await-in-loop -- Preserve probe and report order.
        const issue = await checkedTool(ports, name, found);
        if (issue) { issues.push(issue); }
        else { tools[name] = found.file; }
    }
    if (issues.length > 0) { throw setupFailure(issues, ports.platform); }
    return tools;
}

module.exports = { checkRequiredTools };
