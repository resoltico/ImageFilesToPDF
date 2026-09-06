"use strict";

const { PRINTENV } = require("../core/executables.js");
const { shellQuote } = require("../core/shell.js");
const { runArgv, isExecutable } = require("./shell.js");

/*
 * Discovery of the external command-line tools.
 *
 * Shortcuts runs with a minimal PATH, so the usual install locations are
 * probed directly before falling back to a PATH search.
 *
 * Absence is reported rather than thrown: the preflight collects every problem
 * so the user is told about all of them at once, not the first one.
 */

const TOOL_SEARCH_PATH =
    "/opt/homebrew/bin:/usr/local/bin:/opt/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

const TOOL_NAMES = ["vips", "vipsheader", "pdfcpu"];

const ENVIRONMENT_OVERRIDES = {
    vips: "IMAGE_FILES_TO_PDF_VIPS",
    vipsheader: "IMAGE_FILES_TO_PDF_VIPSHEADER",
    pdfcpu: "IMAGE_FILES_TO_PDF_PDFCPU"
};

function optionalEnvironment(app, name) {
    try {
        return String(
            runArgv(app, [PRINTENV, name], "reading environment")
        ).trim();
    } catch {
        return "";
    }
}

function searchPath(app, executableName) {
    try {
        const found = String(
            app.doShellScript(
                `PATH=${shellQuote(TOOL_SEARCH_PATH)}; ` +
                `command -v ${shellQuote(executableName)}`
            )
        ).trim();

        return found && isExecutable(app, found) ? found : "";
    } catch {
        return "";
    }
}

function candidatePaths(executableName) {
    return [
        `/opt/homebrew/bin/${executableName}`,
        `/usr/local/bin/${executableName}`,
        `/opt/local/bin/${executableName}`
    ];
}

/*
 * Returns the path to the tool, or an empty string if it cannot be found.
 */
function findTool(app, executableName) {
    const override = optionalEnvironment(
        app,
        ENVIRONMENT_OVERRIDES[executableName]
    );

    if (override && isExecutable(app, override)) {
        return override;
    }

    for (const candidate of candidatePaths(executableName)) {
        if (isExecutable(app, candidate)) {
            return candidate;
        }
    }

    return searchPath(app, executableName);
}

module.exports = { TOOL_NAMES, findTool };
