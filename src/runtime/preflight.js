"use strict";

const { shellJoin } = require("../core/shell.js");
const {
    buildVipsProbeArgv,
    buildPdfcpuProbeArgv,
    isVipsUsable,
    isPdfcpuUsable,
    describeSetupProblems
} = require("../core/preflight.js");
const { findTool, TOOL_NAMES } = require("./tools.js");

/*
 * Everything that can be checked before the user is asked anything.
 *
 * This runs first, so a machine that is missing a tool says so immediately
 * rather than after six dialogs have been answered.
 */

/*
 * The probes are expected to fail: they name a file that cannot exist. The
 * suffix merges stderr and forces a zero exit so the output can be read
 * directly instead of being recovered from a thrown error. It is a fixed
 * string, never anything the user supplied.
 */
function probe(app, argv) {
    try {
        return app.doShellScript(`${shellJoin(argv)} 2>&1 || true`);
    } catch {
        return "";
    }
}

function hasHomebrew(app) {
    try {
        return Boolean(app.doShellScript("command -v brew 2>/dev/null || true"));
    } catch {
        return false;
    }
}

const CAPABILITY_PROBES = {
    vips: {
        build: buildVipsProbeArgv,
        usable: isVipsUsable,
        flags: "--size=down and --export-profile"
    },
    pdfcpu: {
        build: buildPdfcpuProbeArgv,
        usable: isPdfcpuUsable,
        flags: "--mode=strict"
    }
};

function inspectTool(app, name) {
    const found = findTool(app, name);

    if (!found) {
        return { tool: name, kind: "missing", path: "" };
    }

    const capability = CAPABILITY_PROBES[name];

    if (capability && !capability.usable(probe(app, capability.build(found)))) {
        return {
            tool: name,
            kind: "unusable",
            flags: capability.flags,
            path: found
        };
    }

    return { tool: name, kind: "ok", path: found };
}

/*
 * Returns the located tools, or throws one message describing every problem.
 */
function checkTools(app) {
    const results = TOOL_NAMES.map((name) => inspectTool(app, name));
    const problems = results.filter((result) => result.kind !== "ok");

    if (problems.length > 0) {
        throw new Error(describeSetupProblems(problems, hasHomebrew(app)));
    }

    const tools = {};

    for (const result of results) {
        tools[result.tool] = result.path;
    }

    return tools;
}

module.exports = { checkTools };
