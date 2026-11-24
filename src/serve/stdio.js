"use strict";

const { Transform } = require("node:stream");
const { createInterface } = require("node:readline");
const { TextDecoder } = require("node:util");
const { message } = require("../core/messages.js");
const { encodeMessage } = require("../core/protocol.js");

function lineWriter(output) {
    output.on("error", () => undefined);
    let tail = Promise.resolve(true);
    return (event) => {
        const line = encodeMessage("engine", event);
        tail = tail.then((success) => success && new Promise((resolve) => {
            output.write(line, "utf8", (error) => resolve(!error));
        }));
        return tail;
    };
}

function utf8Lines(input) {
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    const decoded = new Transform({
        transform(chunk, encoding, next) {
            try { next(null, decoder.decode(chunk, { stream: true })); }
            catch { next(new Error(message("engineInvalidUtf8"))); }
        },
        flush(next) {
            try { next(null, decoder.decode()); }
            catch { next(new Error(message("engineInvalidUtf8"))); }
        }
    });
    input.pipe(decoded);
    const reader = createInterface({ input: decoded, crlfDelay: Infinity });
    return {
        messages: reader[Symbol.asyncIterator](),
        close() {
            reader.close();
            input.unpipe(decoded);
            input.pause();
            decoded.destroy();
        }
    };
}
module.exports = { lineWriter, utf8Lines };
