"use strict";

/*
 * What the tools leave behind. Only the argument each one actually writes is
 * created: creating every path-shaped argument would make verifyFileWritten
 * unfailable, and a stage that silently produced nothing would go unnoticed.
 *
 *   vips <operation> <in> <out> ...
 *   pdfcpu import -- <description> <out> <page>...
 */

const IMPORT_PAGES_START = 5;

/*
 * pdfcpu appends to a PDF that already exists, so its page count is what
 * every import into it has contributed. A stub that forgot the pages could
 * not tell a batch that appended nothing from one that worked.
 */
function importPages(state, argv) {
    const [target] = argv.slice(4);

    state.files.add(target);
    state.pages.set(
        target,
        (state.pages.get(target) ?? 0) + argv.length - IMPORT_PAGES_START
    );
}

function produceOutput(state, argv, command) {
    if (!command.includes("pdfcpu")) {
        state.files.add(String(argv[3]).replace(/\[.*$/u, ""));

        return "";
    }

    if (argv[1] === "import") {
        importPages(state, argv);

        return "";
    }

    if (!state.files.has(argv.at(-1))) {
        // pdfcpu validate and info on a missing file fail, as they do for real.
        throw new Error("no such file");
    }

    return argv[1] === "info"
        ? `          Page count: ${state.pages.get(argv.at(-1)) ?? 0}\n`
        : "";
}

module.exports = { produceOutput };
