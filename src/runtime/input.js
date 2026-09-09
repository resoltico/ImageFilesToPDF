"use strict";

const { normalizeInvocationInput, decodeFileUrl } = require("../core/invocation.js");
const { readTextFile } = require("./shell.js");

/*
 * Resolving whatever Shortcuts, Finder, or a headless caller supplies into
 * items this action can look at. Deciding which of them it will convert is
 * admission.js.
 */

const HEADLESS_MINIMUM_ARGUMENTS = 3;
const HEADLESS_FIRST_IMAGE_INDEX = 2;

/*
 * A selected item may arrive as a POSIX path, as an object that stringifies
 * to one, which is what Shortcuts hands over, or as a file URL, which is what
 * a Finder selection gives.
 *
 * Path() is deliberately not consulted, having been measured rather than
 * assumed. It resolves against the process's working directory and always
 * returns an absolute path, so Path("not-a-path") becomes
 * "/wherever/not-a-path": a path that looks resolved and is not, which
 * defeats the check below instead of helping it. Path("") is worse — it
 * raises an ObjC exception that no JavaScript try/catch can intercept, and
 * takes the whole action down with no dialog and no message.
 */
function pathCandidates(item) {
    const candidates = [];

    for (const produce of [
        () => String(item),
        () => String(item.url())
    ]) {
        try {
            candidates.push(produce());
        } catch {
            candidates.push("");
        }
    }

    return candidates;
}

/*
 * Returns "" when the item is not a path at all. Shortcuts appends a
 * parameters object to the input of every Quick Action, so an item that is
 * not a file is an ordinary occurrence rather than a failure, and must not
 * end a run that has perfectly good images alongside it.
 */
function inputItemToPosixPath(item) {
    for (const value of pathCandidates(item)) {
        if (/^file:\/\//iu.test(value)) {
            return decodeFileUrl(value);
        }

        if (value.charAt(0) === "/") {
            return value;
        }
    }

    return "";
}

function finderSelection() {
    return Application("Finder").selection();
}

/*
 * What kind of run this is travels with it. Which settings a run uses turns
 * on the answer, and reading it back off the settings themselves -- "there
 * are none, so somebody must be here to ask" -- is a guess that a
 * configuration file of `false` or `0` gets wrong: a headless run went to the
 * dialogs and waited for an answer nobody was there to give.
 */
function collectInvocation(app, input, headless) {
    const items = normalizeInvocationInput(input);

    if (!headless) {
        // Settings come from dialogs, but only after the cheap checks have
        // passed and there is actually something to convert.
        return { headless: false, settings: null, timestamp: "", inputItems: items };
    }

    if (items.length < HEADLESS_MINIMUM_ARGUMENTS) {
        throw new Error(
            "Headless usage: --headless /path/to/config.json /path/to/image ..."
        );
    }

    const configuration = JSON.parse(readTextFile(app, String(items[1])));

    /*
     * Valid JSON is not yet a configuration. `null`, `false`, `0` and a bare
     * string all parse, and asking any of them for a setting fails somewhere
     * further along in words about the failure rather than about the file --
     * "null is not an object", or an unsupported paper size that was never
     * supported because there was never a paper size.
     */
    if (
        !configuration ||
        typeof configuration !== "object" ||
        Array.isArray(configuration)
    ) {
        throw new Error(
            "The headless configuration must be a JSON object of settings."
        );
    }

    return {
        headless: true,
        settings: configuration,
        timestamp: configuration.timestamp
            ? String(configuration.timestamp)
            : "",
        inputItems: items.slice(HEADLESS_FIRST_IMAGE_INDEX)
    };
}

module.exports = {
    pathCandidates,
    inputItemToPosixPath,
    finderSelection,
    collectInvocation
};
