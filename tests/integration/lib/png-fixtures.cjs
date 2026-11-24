"use strict";
const { Buffer } = require("node:buffer");
const { crc32 } = require("node:zlib");

const signature = Buffer.from("89504e470d0a1a0a", "hex");
const header = Buffer.from("00000001000000010802000000", "hex");
const rgb = Buffer.from("789c63500eef040001a40104", "hex");

function word(value) {
    const bytes = Buffer.alloc(4);
    bytes.writeUInt32BE(value);
    return bytes;
}

function chunk(type, data = Buffer.alloc(0)) {
    const content = Buffer.concat([Buffer.from(type), data]);
    return Buffer.concat([word(data.length), content, word(crc32(content))]);
}

function control(sequence) {
    return chunk("fcTL", Buffer.concat([word(sequence), word(1), word(1), word(0), word(0), Buffer.from([0, 1, 0, 10, 0, 0])]));
}

function animation(frames) { return chunk("acTL", Buffer.concat([word(frames), word(0)])); }

function image(...chunks) {
    return Buffer.concat([signature, chunk("IHDR", header), ...chunks, chunk("IEND")]);
}

function pngFixtures() {
    const staticData = chunk("IDAT", rgb);
    const frame = (sequence) => chunk("fdAT", Buffer.concat([word(sequence), rgb]));
    const badCount = animation(1);
    // Alter the stored metadata CRC while preserving the still image bytes.
    badCount[badCount.length - 1] += 1;
    return {
        single: image(animation(1), control(0), staticData),
        multiple: image(animation(2), control(0), staticData, control(1), frame(2)),
        separateDefault: image(animation(1), staticData, control(0), frame(1)),
        malformed: image(badCount, staticData)
    };
}

module.exports = { pngFixtures };
