"use strict";

// Deliberately independent of the application's publication adapter.
function run(input) {
    ObjC.import("stdio");
    ObjC.bindFunction("__error", ["int *", []]);
    const RENAME_EXCL = 4;
    const status = $.renamex_np(String(input[0]), String(input[1]), RENAME_EXCL);
    // __error is the fixed native thread-local errno symbol.
    // eslint-disable-next-line no-underscore-dangle
    const code = status === 0 ? 0 : Number($.__error()[0]);
    return JSON.stringify({ status, code });
}
module.exports = { run };
