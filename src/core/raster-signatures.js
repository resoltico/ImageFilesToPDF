"use strict";

const SIGNATURE_BYTES = 12;
const WEBP_TAG_OFFSET = 8;
/* eslint-disable no-magic-numbers -- The format specifications define these byte sequences. */
const PNG_SIGNATURE = Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const REQUIRED_SIGNATURES = [
    [[0, PNG_SIGNATURE]],
    [[0, [0xff, 0xd8, 0xff]]],
    [[0, [0x49, 0x49, 0x2a, 0x00]]],
    [[0, [0x4d, 0x4d, 0x00, 0x2a]]],
    [[0, [0x52, 0x49, 0x46, 0x46]], [WEBP_TAG_OFFSET, [0x57, 0x45, 0x42, 0x50]]]
];
/* eslint-enable no-magic-numbers */

function unknownFormatCode(prefix) {
    const recognized = REQUIRED_SIGNATURES.some((signature) => signature.every(([offset, bytes]) =>
        bytes.every((byte, index) => prefix[offset + index] === byte)));
    return recognized ? "damaged" : "not-an-image";
}

module.exports = { PNG_SIGNATURE, SIGNATURE_BYTES, unknownFormatCode };
