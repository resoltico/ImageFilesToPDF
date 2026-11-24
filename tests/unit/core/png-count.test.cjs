"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Buffer } = require("node:buffer");
const { crc32 } = require("node:zlib");
const { countPng } = require("../../../src/core/png-count.js");
const { pngFixtures } = require("../../integration/lib/png-fixtures.cjs");

const signature = Buffer.from("89504e470d0a1a0a", "hex");
const dimensions = Buffer.from("00000003000000020802000000", "hex");
const defaultData = Buffer.from([1, 2, 3]);

function words(...values) {
    const bytes = Buffer.alloc(values.length * 4);
    values.forEach((value, index) => bytes.writeUInt32BE(value, index * 4));
    return bytes;
}

function chunk(type, data = Buffer.alloc(0)) {
    const payload = Buffer.concat([Buffer.from(type), data]);
    return Buffer.concat([words(data.length), payload, words(crc32(payload))]);
}

const head = chunk("IHDR", dimensions);
const end = chunk("IEND");
const still = chunk("IDAT", defaultData);
const empty = chunk("IDAT");
const ancillary = chunk("tEXt");
const declare = (count) => chunk("acTL", words(count, 0));

function control(overrides = {}) {
    const { sequence = 0, width = 3, height = 2, left = 0, top = 0, dispose = 0, blend = 0 } = overrides;
    return chunk("fcTL", Buffer.concat([words(sequence, width, height, left, top), Buffer.from([0, 1, 0, 10, dispose, blend])]));
}

function frame(sequence, data = defaultData) {
    return chunk("fdAT", Buffer.concat([words(sequence), data]));
}

function reader(bytes) {
    return { read: (position, size) => bytes.subarray(position, position + size), checksum: crc32 };
}

function images(...chunks) {
    const bytes = Buffer.concat([signature, ...chunks]);
    return countPng(reader(bytes), bytes.length);
}

test("a static PNG and each valid APNG default-image arrangement count as images", () => {
    const { single, multiple, separateDefault } = pngFixtures();
    for (const [bytes, count] of [[single, 1], [multiple, 2], [separateDefault, 2]]) {
        assert.equal(countPng(reader(bytes), bytes.length), count);
    }
    assert.equal(images(head, empty, still, ancillary, end), 1);
    assert.equal(images(head, declare(2), control(), empty, still, control({ sequence: 1, width: 1, height: 1, left: 2, top: 1, dispose: 2, blend: 1 }),
        frame(2, Buffer.alloc(0)), frame(3), end), 2);
});

test("truncated reads, signatures, chunk lengths and framing fail closed", () => {
    for (const size of [-1, 3, 8.5, 8]) { assert.throws(() => countPng(reader(Buffer.alloc(0)), size), /image count could not be verified/u); }
    assert.throws(() => countPng(reader(Buffer.alloc(8)), 8), /image count could not be verified/u);
    const { malformed } = pngFixtures();
    assert.throws(() => countPng(reader(malformed), malformed.length), /image count could not be verified/u);
    for (const parts of [
        [head, still], [head, still, end, ancillary], [still, end], [head, head, still, end],
        [head, chunk("bad!"), still, end], [head, words(0x80000000), Buffer.from("tEXt"), still, end],
        [head, words(2000), Buffer.from("tEXt"), still, end], [chunk("IHDR", Buffer.alloc(12)), still, end],
        [chunk("IHDR", Buffer.concat([words(0, 2), dimensions.subarray(8)])), still, end],
        [chunk("IHDR", Buffer.concat([words(3, 0), dimensions.subarray(8)])), still, end],
        [head, empty, end], [head, still, ancillary, still, end]
    ]) { assert.throws(() => images(...parts), /image count could not be verified/u); }
});

test("invalid frame metadata or payload ordering never falls back to one image", () => {
    for (const parts of [
        [declare(0), still], [declare(131073), still], [still, declare(1)], [declare(1), declare(1), still],
        [control(), still], [declare(1), control({ sequence: 1 }), still], [declare(2), control(), still],
        [declare(2), control(), control({ sequence: 1 }), still],
        [declare(1), frame(0), still], [declare(1), still, frame(0)], [declare(1), still, control(), chunk("fdAT", Buffer.from([1]))],
        [declare(1), still, control(), frame(2)], [declare(1), still, control(), frame(1, Buffer.alloc(0))],
        [declare(2), still, control(), control({ sequence: 1 }), frame(2)]
    ]) { assert.throws(() => images(head, ...parts, end), /image count could not be verified/u); }
    for (const options of [{ width: 0 }, { height: 0 }, { left: 1 }, { top: 1 }, { dispose: 3 }, { blend: 2 }, { width: 2 }, { height: 1 }]) {
        assert.throws(() => images(head, declare(1), control(options), still, end), /image count could not be verified/u);
    }
});


function checkedReads(bytes, fileSize = bytes.length) {
    const source = reader(bytes);
    const reads = [];
    const count = () => countPng({ checksum: crc32, read(offset, size) {
        reads.push([offset, size]);
        assert.ok(offset + size <= fileSize, "The parser attempted to read beyond the supplied file size.");
        return source.read(offset, size);
    } }, fileSize);
    return { count, reads };
}

test("untrusted sizes and signature bytes are refused before chunk inspection", () => {
    const valid = Buffer.concat([signature, head, still, end]);
    const bad = Buffer.from(valid);
    bad[1] = 0;
    for (const [bytes, size, reads] of [
        [valid, valid.length + 0.5, []], [valid, 7, []], [valid, 8, [[0, 8]]],
        [bad, bad.length, [[0, 8]]]
    ]) {
        const probe = checkedReads(bytes, size);
        assert.throws(probe.count, /image count could not be verified/u);
        assert.deepEqual(probe.reads, reads);
    }
    assert.throws(() => countPng({
        read: (position, size) => valid.subarray(position, position + size - Number(position === 0)), checksum: crc32
    }, valid.length), /image count could not be verified/u);
});

test("header and complete animation inputs cannot hide bad control sizes or checksums", () => {
    const damagedHead = Buffer.from(head);
    damagedHead[damagedHead.length - 1] = (damagedHead.at(-1) + 1) % 256;
    const damagedEnd = Buffer.from(end);
    damagedEnd[damagedEnd.length - 1] = (damagedEnd.at(-1) + 1) % 256;
    for (const chunks of [
        [chunk("IHDR", dimensions.subarray(0, 12)), still, end], [damagedHead, still, end], [head, still, damagedEnd],
        [head, declare(1), declare(1), control(), still, end],
        [head, declare(1), still, declare(1), control(), frame(1), end]
    ]) {
        assert.throws(() => images(...chunks), /image count could not be verified/u);
    }
});

test("a partial frame must fit its canvas even after the default image", () => {
    for (const options of [{ width: 0 }, { height: 0 }, { width: 2, left: 2 }, { height: 1, top: 2 }]) {
        assert.throws(() => images(head, declare(1), still, control(options), frame(1), end), /image count could not be verified/u);
    }
    // An fdAT before any matching frame cannot contribute data to a later frame.
    assert.throws(() => images(head, declare(1), still, frame(0), control({ sequence: 1 }), frame(2), end), /image count could not be verified/u);
    assert.throws(() => images(head, declare(1), control(), frame(1), still, end), /image count could not be verified/u);
});

test("chunk headers and control bytes are refused before out-of-range I/O", () => {
    const prefix = Buffer.concat([signature, head, still]);
    const notAHeader = checkedReads(Buffer.concat([prefix, end]), prefix.length + 11);
    assert.throws(notAHeader.count, /image count could not be verified/u);
    assert.ok(notAHeader.reads.every(([position]) => position < prefix.length));
    const extent = Buffer.concat([signature, head, declare(1), still]);
    const animationStart = signature.length + head.length;
    const incomplete = checkedReads(extent, animationStart + 19);
    assert.throws(incomplete.count, /image count could not be verified/u);
    assert.deepEqual(incomplete.reads.at(-1), [animationStart, 8]);
});

test("the PNG maximum chunk size is inclusive and larger chunks fail before a seek", () => {
    const prefix = Buffer.concat([signature, head]);
    function mock(length) {
        const header = Buffer.concat([words(length), Buffer.from("IDAT")]);
        const endStart = prefix.length + length + 12;
        const source = { checksum: crc32, read(position, size) {
            if (position < prefix.length) { return prefix.subarray(position, position + size); }
            if (position === prefix.length) { return header; }
            return end.subarray(position - endStart, position - endStart + size);
        } };
        return { source, size: endStart + end.length };
    }
    const max = mock(0x7fffffff);
    assert.equal(countPng(max.source, max.size), 1);
    const tooLarge = mock(0x80000000);
    assert.throws(() => countPng(tooLarge.source, tooLarge.size), /image count could not be verified/u);
});

test("the parser refuses excess frames and too-short frame data before reading their contents", () => {
    const base = Buffer.concat([signature, head, declare(1), control(), still]);
    const extra = checkedReads(Buffer.concat([base, control({ sequence: 1 }), end]));
    assert.throws(extra.count, /image count could not be verified/u);
    assert.deepEqual(extra.reads.at(-1), [base.length, 8]);

    const animation = Buffer.concat([signature, head, declare(1), still, control()]);
    const short = checkedReads(Buffer.concat([animation, chunk("fdAT", Buffer.alloc(3)), end]));
    assert.throws(short.count, /image count could not be verified/u);
    assert.deepEqual(short.reads.at(-1), [animation.length, 8]);
});

test("an excessive declared frame count is refused before the next chunk", () => {
    const prefix = Buffer.concat([signature, head]);
    const above = declare(131073);
    const max = declare(131072);
    const excess = checkedReads(Buffer.concat([prefix, above, still, end]));
    const boundary = checkedReads(Buffer.concat([prefix, max, still, end]));
    assert.throws(excess.count, /image count could not be verified/u);
    assert.throws(boundary.count, /image count could not be verified/u);
    assert.deepEqual(excess.reads.at(-1), [prefix.length + 8, 12]);
    assert.deepEqual(boundary.reads.at(-1), [prefix.length + max.length + still.length + 8, 4]);
});
