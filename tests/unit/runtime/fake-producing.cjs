"use strict";

/*
 * What the tools leave behind. Only the argument each one actually writes is
 * created: creating every path-shaped argument would make verifyFileWritten
 * unfailable, and a stage that silently produced nothing would go unnoticed.
 *
 *   vips <operation> <in> <out> ...
 *   pdfcpu import --conf disable -- <description> <out> <page>...
 */

const IMPORT_PAGES_START = 7;

/*
 * pdfcpu appends to a PDF that already exists, so its page count is what
 * every import into it has contributed. A stub that forgot the pages could
 * not tell a batch that appended nothing from one that worked.
 */
function importPages(state, argv) {
    for (const page of argv.slice(IMPORT_PAGES_START)) {
        if (!state.files.has(page)) { throw new Error(`pdfcpu input absent: ${page}`); }
    }
    const [target] = argv.slice(6);

    state.files.add(target);
    state.pages.set(
        target,
        (state.pages.get(target) ?? 0) + argv.length - IMPORT_PAGES_START
    );
}

function produceRaster(state, argv) {
    if (["thumbnail", "flatten", "gravity"].includes(argv[1]) && !state.files.has(argv[2])) {
        throw new Error(`vips input absent: ${argv[2]}`);
    }
    state.files.add(String(argv[3]).replace(/\[.*$/u, ""));
    return "";
}

function produceOutput(state, argv, command) {
    if (!command.includes("pdfcpu")) { return produceRaster(state, argv); }

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
