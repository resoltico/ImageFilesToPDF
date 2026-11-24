"use strict";
const { Buffer } = require("node:buffer");
const { readSync } = require("node:fs");
const { crc32 } = require("node:zlib");
const { OperationError } = require("../core/errors.js");

const SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const MAX_CHUNK_LENGTH = 0x7fffffff;
const MAX_CHUNKS = 131072;
const CHUNK_HEADER = 8;
const CRC_BYTES = 4;
const CONTROL_SIZE = { acTL: 8, fcTL: 26, IEND: 0, IHDR: 13 };
const WORD = 4;
const FRAME_FIELDS = { width: 4, height: 8, xOffset: 12, yOffset: 16, dispose: 24, blend: 25 };
const LAST_DISPOSE_OP = 2;

function requirePng(ok) {
    if (!ok) { throw new OperationError("PNG image count could not be verified."); }
}

function readAt(fd, size, position) {
    const data = Buffer.alloc(size);
    requirePng(readSync(fd, data, 0, size, position) === size);
    return data;
}

function controlData(fd, offset, { header, length: size }, expected) {
    requirePng(size === expected);
    const frame = readAt(fd, size + CRC_BYTES, offset + CHUNK_HEADER);
    const data = frame.subarray(0, size);
    requirePng(crc32(data, crc32(header.subarray(CRC_BYTES))) === frame.readUInt32BE(size));
    return data;
}

function frameControl(data, state) {
    const width = data.readUInt32BE(FRAME_FIELDS.width);
    const height = data.readUInt32BE(FRAME_FIELDS.height);
    const xOffset = data.readUInt32BE(FRAME_FIELDS.xOffset);
    const yOffset = data.readUInt32BE(FRAME_FIELDS.yOffset);
    requirePng(data.readUInt32BE(0) === state.sequence && width > 0 && height > 0 &&
        xOffset + width <= state.width && yOffset + height <= state.height && data[FRAME_FIELDS.dispose] <= LAST_DISPOSE_OP && data[FRAME_FIELDS.blend] <= 1);
    if (!state.idat) {
        requirePng(!state.defaultFrame && width === state.width && height === state.height && xOffset === 0 && yOffset === 0);
        state.defaultFrame = true;
    }
    requirePng(state.frames === 0 || state.frameData);
    state.frames += 1;
    state.sequence += 1;
    state.frameData = false;
}

function readChunk(fd, offset, fileSize, first) {
    requirePng(fileSize - offset >= CHUNK_HEADER + CRC_BYTES);
    const header = readAt(fd, CHUNK_HEADER, offset);
    const length = header.readUInt32BE(0);
    const type = header.toString("latin1", WORD);
    const end = offset + CHUNK_HEADER + length + CRC_BYTES;
    requirePng(length <= MAX_CHUNK_LENGTH && end <= fileSize && /^[A-Za-z]{4}$/u.test(type) && first === (type === "IHDR"));
    return { header, length, type, end };
}

function imageData(state, length) {
    requirePng(!state.endedIdat);
    state.idat = true;
    state.imageData ||= length > 0;
    state.frameData ||= state.defaultFrame && length > 0;
}

function animationData(fd, offset, state, length) {
    requirePng(state.idat && state.frames > Number(state.defaultFrame) && length >= WORD &&
        readAt(fd, WORD, offset + CHUNK_HEADER).readUInt32BE(0) === state.sequence);
    state.sequence += 1;
    state.frameData ||= length > WORD;
}

function observeChunk(fd, offset, chunk, state) {
    const { length, type } = chunk;
    const control = () => controlData(fd, offset, chunk, CONTROL_SIZE[type]);
    if (state.idat && type !== "IDAT") { state.endedIdat = true; }
    if (type === "IHDR") {
        const data = control();
        state.width = data.readUInt32BE(0);
        state.height = data.readUInt32BE(WORD);
        requirePng(state.width > 0 && state.height > 0);
    } else if (type === "acTL") {
        requirePng(!state.idat && state.declared === 0);
        state.declared = control().readUInt32BE(0);
        requirePng(state.declared > 0 && state.declared <= MAX_CHUNKS);
    } else if (type === "fcTL") {
        requirePng(state.declared > state.frames);
        frameControl(control(), state);
    } else if (type === "IDAT") {
        imageData(state, length);
    } else if (type === "fdAT") {
        animationData(fd, offset, state, length);
    }
}

// Counts images using PNG §4.9 and §11.3.6. Native decoding checks pixel data.
function countPng(fd, fileSize) {
    requirePng(Number.isSafeInteger(fileSize) && fileSize >= SIGNATURE.length && readAt(fd, SIGNATURE.length, 0).equals(SIGNATURE));
    const state = { idat: false, endedIdat: false, imageData: false, declared: 0, frames: 0, sequence: 0, defaultFrame: false, frameData: false };
    let offset = SIGNATURE.length;
    for (let index = 0; index < MAX_CHUNKS; index += 1) {
        const chunk = readChunk(fd, offset, fileSize, index === 0);
        if (chunk.type === "IEND") {
            controlData(fd, offset, chunk, CONTROL_SIZE.IEND);
            requirePng(chunk.end === fileSize && state.imageData && state.frames === state.declared && (state.frames === 0 || state.frameData));
            return state.frames + Number(!state.defaultFrame);
        }
        observeChunk(fd, offset, chunk, state);
        offset = chunk.end;
    }
    throw new OperationError("PNG image count exceeded the chunk limit.");
}
module.exports = { countPng };
