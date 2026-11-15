"use strict";
const { nativePublication } = require("../../src/host/native-publication.js");

/** Ordinary rename isolates filename readback even where exclusive claims are unsupported. */
function run(argv) {
    const [source, destination] = argv.map(String);
    const publication = nativePublication(ObjC, $);
    ObjC.bindFunction("rename", ["int", ["char *", "char *"]]);
    const expected = publication.facts(source);
    if ($.rename(source, destination) !== 0) { throw new Error("The owned filename-readback fixture could not be renamed."); }
    return JSON.stringify({ expected, actual: publication.actualPath(destination, expected), observed: publication.facts(destination) });
}
module.exports = { run };
