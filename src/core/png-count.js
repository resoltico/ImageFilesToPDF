"use strict";
const { message } = require("./messages.js");
const { OperationError } = require("./errors.js");

const { PNG_SIGNATURE } = require("./raster-signatures.js");
const MAX_CHUNK_LENGTH = 0x7fffffff;
const MAX_CHUNKS = 131072;
const CHUNK_HEADER = 8;
const CRC_BYTES = 4;
const CONTROL_SIZE = { acTL: 8, fcTL: 26, IEND: 0, IHDR: 13 };
const WORD = 4;
const FRAME_FIELDS = { width: 4, height: 8, xOffset: 12, yOffset: 16, dispose: 24, blend: 25 };
const LAST_DISPOSE_OP = 2;

function requirePng(ok) {
    if (!ok) { throw new OperationError(message("pngCountUnverified")); }
}

function readAt(reader, size, position) {
    const data = reader.read(position, size);
    requirePng(data.length === size);
    return data;
}

function unsignedWord(data, offset) {
    return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset);
}

function controlData(reader, offset, { header, length: size }, expected) {
    requirePng(size === expected);
    const frame = readAt(reader, size + CRC_BYTES, offset + CHUNK_HEADER);
    const data = frame.subarray(0, size);
    requirePng(reader.checksum(data, reader.checksum(header.subarray(CRC_BYTES))) === unsignedWord(frame, size));
    return data;
}

function completedFrame(state) {
    if (state.frames === 0) { return true; }
    return state.defaultFrame && state.frames === 1 ? state.imageData : state.frameData;
}

function frameControl(data, state) {
    const width = unsignedWord(data, FRAME_FIELDS.width);
    const height = unsignedWord(data, FRAME_FIELDS.height);
    const xOffset = unsignedWord(data, FRAME_FIELDS.xOffset);
    const yOffset = unsignedWord(data, FRAME_FIELDS.yOffset);
    requirePng(unsignedWord(data, 0) === state.sequence && width > 0 && height > 0 &&
        xOffset + width <= state.width && yOffset + height <= state.height && data[FRAME_FIELDS.dispose] <= LAST_DISPOSE_OP && data[FRAME_FIELDS.blend] <= 1);
    if (!state.idat) {
        requirePng(!state.defaultFrame && width === state.width && height === state.height);
        state.defaultFrame = true;
    }
    requirePng(completedFrame(state));
    state.frames += 1;
    state.sequence += 1;
    state.frameData = false;
}

function readChunk(reader, offset, fileSize, first) {
    requirePng(fileSize - offset >= CHUNK_HEADER + CRC_BYTES);
    const header = readAt(reader, CHUNK_HEADER, offset);
    const length = unsignedWord(header, 0);
    const type = String.fromCharCode(...header.subarray(WORD));
    const end = offset + CHUNK_HEADER + length + CRC_BYTES;
    requirePng(length <= MAX_CHUNK_LENGTH && end <= fileSize && !/[^A-Za-z]/u.test(type) && first === (type === "IHDR"));
    return { header, length, type, end };
}

function imageData(state, length) {
    requirePng(!state.endedIdat);
    state.idat = true;
    state.imageData ||= length > 0;
}

function animationData(reader, offset, state, length) {
    requirePng(state.frames > Number(state.defaultFrame) && length >= WORD &&
        unsignedWord(readAt(reader, WORD, offset + CHUNK_HEADER), 0) === state.sequence);
    state.sequence += 1;
    state.frameData ||= length > WORD;
}

function observeChunk(reader, offset, chunk, state) {
    const { length, type } = chunk;
    const control = () => controlData(reader, offset, chunk, CONTROL_SIZE[type]);
    if (state.idat && type !== "IDAT") { state.endedIdat = true; }
    if (type === "IHDR") {
        const data = control();
        state.width = unsignedWord(data, 0);
        state.height = unsignedWord(data, WORD);
        requirePng(state.width > 0 && state.height > 0);
    } else if (type === "acTL") {
        requirePng(!state.idat && state.declared === 0);
        state.declared = unsignedWord(control(), 0);
        requirePng(state.declared > 0 && state.declared <= MAX_CHUNKS);
    } else if (type === "fcTL") {
        requirePng(state.declared > state.frames);
        frameControl(control(), state);
    } else if (type === "IDAT") {
        imageData(state, length);
    } else if (type === "fdAT") {
        animationData(reader, offset, state, length);
    }
}

// Counts images using PNG §4.9 and §11.3.6. Native decoding checks pixel data.
function countPng(reader, fileSize) {
    requirePng(Number.isSafeInteger(fileSize) && fileSize >= PNG_SIGNATURE.length &&
        readAt(reader, PNG_SIGNATURE.length, 0).every((byte, index) => byte === PNG_SIGNATURE[index]));
    const state = { idat: false, endedIdat: false, imageData: false, declared: 0, frames: 0, sequence: 0, defaultFrame: false };
    let offset = PNG_SIGNATURE.length;
    for (let index = 0; index < MAX_CHUNKS; index += 1) {
        const chunk = readChunk(reader, offset, fileSize, index === 0);
        if (chunk.type === "IEND") {
            controlData(reader, offset, chunk, CONTROL_SIZE.IEND);
            requirePng(chunk.end === fileSize && state.imageData && state.frames === state.declared && completedFrame(state));
            return state.frames + Number(!state.defaultFrame);
        }
        observeChunk(reader, offset, chunk, state);
        offset = chunk.end;
    }
    throw new OperationError(message("pngCountChunkLimit"));
}
module.exports = { countPng };
