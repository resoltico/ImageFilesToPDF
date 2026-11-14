"use strict";
const { OperationError } = require("../core/errors.js");

const { PRINTENV } = require("./backend-executables.js");
const { shellQuote } = require("../backend/shell.js");
const { runArgv } = require("./shell.js");
const { isUserCanceled } = require("../core/errors.js");
const { hostError } = require("./cancellation.js");
const { isExecutable } = require("./asking.js");

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

/*
 * printenv fails for a name that is not set, which is the same answer as a
 * name set to nothing.
 */
function optionalEnvironment(app, name) {
    try { return { state: "provided", value: String(runArgv(app, [PRINTENV, name], "reading the requested tool override")) }; }
    catch (error) {
        if (isUserCanceled(error)) { throw error; }
        if (error.cause?.errorNumber === 1) { return { state: "absent" }; }
        throw error;
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
    } catch (caught) {
        const error = hostError(caught);
        if (isUserCanceled(error) || error instanceof TypeError || error instanceof ReferenceError) { throw error; }
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

    if (override.state === "provided") {
        const path = override.value.trim();
        const requested = { name: ENVIRONMENT_OVERRIDES[executableName], value: override.value };
        if (!path || !isExecutable(app, path)) {
            throw new OperationError(`${requested.name}=${JSON.stringify(requested.value)} is not an absolute regular executable file.`);
        }
        return { path, override: requested };
    }

    for (const candidate of candidatePaths(executableName)) {
        if (isExecutable(app, candidate)) {
            return { path: candidate, override: null };
        }
    }

    return { path: searchPath(app, executableName), override: null };
}

module.exports = { TOOL_NAMES, TOOL_SEARCH_PATH, findTool };
