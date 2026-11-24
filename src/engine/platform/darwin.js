"use strict";
const { helperSession } = require("../line-helper.js");
const { MAC_OSASCRIPT } = require("../executables.js");

const HELPER = `
ObjC.import("Foundation");
ObjC.bindFunction("getchar", ["int", []]);
ObjC.bindFunction("puts", ["int", ["char *"]]);
ObjC.bindFunction("fflush", ["int", ["void *"]]);
ObjC.bindFunction("__error", ["int *", []]);
ObjC.bindFunction("renamex_np", ["int", ["char *", "char *", "unsigned int"]]);
function facts(path) {
    const url = $.NSURL.fileURLWithPath($(path));
    const values = url.resourceValuesForKeysError($([$.NSURLIsPackageKey, $.NSURLIsAliasFileKey]), Ref());
    if (!values || values.isNil()) return null;
    const property = (key) => ObjC.unwrap(values.objectForKey(key));
    return { package: property($.NSURLIsPackageKey), alias: property($.NSURLIsAliasFileKey) };
}
function answer(request) {
    if (request.type === "packages") return request.paths.map(facts);
    if (request.type === "renameExclusive") {
        const status = Number($.renamex_np(request.from, request.to, 4));
        return { status, errno: status === 0 ? 0 : Number($.__error()[0]) };
    }
    throw new Error("Unknown macOS helper request.");
}
function run() {
    let line = "";
    for (;;) {
        const byte = Number($.getchar());
        if (byte === -1) return;
        if (byte === 10) {
            $.puts(JSON.stringify(answer(JSON.parse(line))));
            $.fflush(null);
            line = "";
        } else {
            line += String.fromCharCode(byte);
        }
    }
}
`;

const RADIX = 16;
const ESCAPE_DIGITS = 4;

function encode(request) {
    // Escaped UTF-16 code units are valid ASCII on the helper's UTF-8 wire.
    return JSON.stringify(request).replace(/[^\p{ASCII}]/gu, (point) => point.split("").map((unit) =>
        `\\u${unit.charCodeAt(0).toString(RADIX).padStart(ESCAPE_DIGITS, "0")}`).join(""));
}

function darwinHelper() {
    let native = null;
    return {
        request(request) {
            native ??= helperSession(MAC_OSASCRIPT, ["-l", "JavaScript", "-e", HELPER], { detached: true, encode });
            return native.request(request);
        },
        close() { return native?.close(); }
    };
}

module.exports = { darwinHelper };
