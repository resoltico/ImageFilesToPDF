"use strict";
const { nativeDestinationNames } = require("../../src/host/destination-names.js");
function run(input) {
    return JSON.stringify(nativeDestinationNames(ObjC, $).groups(JSON.parse(String(input[0])), String(input[1])));
}
module.exports = { run };
