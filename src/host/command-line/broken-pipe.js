"use strict";
const { IssueError, OperationError, errorMessage } = require("../../core/errors.js");
const { issuesOf } = require("../../core/outcomes.js");
const { nativeSignalActions } = require("./signal-actions.js");
const SIGPIPE = 13;

function finishOutputSignal(actions, snapshot, changed) {
    const cleanup = [];
    if (changed) {
        try {
            if (actions.restore(SIGPIPE, snapshot) !== 0) { throw new OperationError("The previous output signal disposition could not be restored."); }
        } catch (error) { cleanup.push(error); }
    }
    // sigaction copies its user buffer synchronously. It retains no pointer,
    // so free is safe even when restoration failed; that failure stays visible.
    try { actions.free(snapshot); }
    catch (error) { cleanup.push(error); }
    return cleanup;
}

// Only the synchronous native transport call is protected. Processing/children
// retain their inherited dispositions; no JS function is installed as a C handler.
function withoutSigpipe(write, actions = nativeSignalActions()) {
    const snapshot = actions.allocate();
    if (!snapshot) { throw new OperationError("Storage for the output signal disposition could not be allocated."); }
    let changed = false, failed = false, primary = null, value = null;
    try {
        if (actions.read(SIGPIPE, snapshot) !== 0) { throw new OperationError("The output signal disposition could not be read."); }
        // Even an ignore call that throws may have changed native state.
        changed = true;
        if (actions.ignore(SIGPIPE) !== 0) { throw new OperationError("Broken-pipe termination could not be disabled for output."); }
        value = write();
    } catch (error) { failed = true; primary = error; }
    const cleanup = finishOutputSignal(actions, snapshot, changed);
    if (cleanup.length) {
        throw new IssueError(failed ? errorMessage(primary) : "Output signal cleanup failed.", {
            cause: failed ? primary : cleanup[0],
            issues: [...failed ? issuesOf(primary, "reporting") : [], ...cleanup.flatMap((error) => issuesOf(error, "cleanup"))]
        });
    }
    if (failed) { throw primary; }
    return value;
}
module.exports = { withoutSigpipe };
