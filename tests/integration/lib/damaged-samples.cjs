"use strict";

const { Buffer } = require("node:buffer");
const fs = require("node:fs");
const path = require("node:path");

function damagedSamples(folder) {
    const samples = {
        "cut.png": "89504e470d0a1a0a0000000d49484452",
        "cut.tif": "49492a00082400000000000000000000",
        "cut.jpg": "ffd8ffe100bc45786966000049492a00",
        "cut.webp": "524946460c0100005745425056503858"
    };
    const files = Object.fromEntries(Object.entries(samples).map(([name, hex]) => [path.join(folder, name), Buffer.from(hex, "hex")]));
    files[path.join(folder, "text.png")] = Buffer.from("synthetic plain text\n");
    for (const [file, contents] of Object.entries(files)) { fs.writeFileSync(file, contents); }
    return files;
}

if (require.main === module) { damagedSamples(process.argv[2]); }
module.exports = { damagedSamples };
