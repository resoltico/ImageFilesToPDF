"use strict";
const { message } = require("../core/messages.js");
const { commandLengthOf } = require("../backend/batching.js");
const { HEADER_ARGV_BUDGET, runArgv, removeFile } = require("./shell.js");
const { isDirectory, isRegularFile, verifyFileWritten } = require("./asking.js");
const { createWorkspace, removeWorkspace } = require("./workspace.js");
const { inputItemToPosixPath } = require("./input.js");
const { describeUnresolved } = require("./reasons.js");
const { stagingArea, openStaging, closeStaging } = require("./staging-area.js");
const { setAside } = require("./rescue.js");
const { CP } = require("./backend-executables.js");
const { OperationError } = require("../core/errors.js");

function runOperations(app) {
    const fits = (argv) => commandLengthOf(argv) <= HEADER_ARGV_BUDGET;
    return {
        fits,
        run(argv, label) {
            if (!fits(argv)) { throw new OperationError(message("commandArgumentBudgetExceeded")); }
            return runArgv(app, argv, label);
        },
        resolve(item) { const path = inputItemToPosixPath(item); return path ? { path } : { refusal: describeUnresolved(item) }; },
        fileKind(path) {
            if (isDirectory(app, path)) { return "directory"; }
            return isRegularFile(app, path) ? "file" : "unavailable";
        },
        verifyFile: (path, label) => verifyFileWritten(app, path, label),
        removeFile: (path) => removeFile(app, path),
        createWorkspace: (storage) => createWorkspace(app, storage),
        removeWorkspace: (path) => removeWorkspace(app, path),
        stagingArea,
        openStaging: (area) => openStaging(app, area),
        closeStaging: (area) => closeStaging(app, area),
        copyBeside: (from, to) => runArgv(app, [CP, from, to], "copying the PDF into the output folder"),
        setAside: (path, publication, options) => setAside(app, path, publication, options)
    };
}

module.exports = { runOperations };
