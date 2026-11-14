"use strict";
const { Buffer } = require("node:buffer");
const { TextDecoder } = require("node:util");

function data(bytes) {
    return { bytes, subdataWithRange: ({ location, length }) => data(bytes.subarray(location, location + length)),
        isEqualToData: (other) => bytes.equals(other.bytes) };
}
function record(name) {
    const bytes = Buffer.from(name), entry = Buffer.alloc(1048);
    entry.writeUInt16LE(1048, 16); entry.writeUInt16LE(bytes.length, 18); bytes.copy(entry, 21);
    return entry;
}
function fakeDirectory(names = []) {
    const control = { openCode: 0, readCode: 0, closeCode: 0 };
    const errno = [0], events = [];
    const open = (directory) => {
        events.push(["open", directory]); errno[0] = control.openCode;
        return control.openCode ? null : { index: 0, entries: typeof names === "function" ? names(directory) : names };
    };
    const read = (stream) => {
        events.push("read");
        if (control.readFault) { throw control.readFault; }
        if (stream.index === stream.entries.length) { errno[0] = control.readCode; return null; }
        const entry = stream.entries[stream.index]; stream.index += 1;
        return typeof entry === "string" ? record(entry) : entry;
    };
    const ns = {
        opendir: open, readdir: read, "opendir$INODE64": open, "readdir$INODE64": read,
        "__error": () => errno,
        closedir() { events.push("close"); errno[0] = control.closeCode; return control.closeCode ? -1 : 0; },
        NSValue: { valueWithPointer: (pointer) => ({ pointerValue: pointer }) },
        NSMakeRange: (location, length) => ({ location, length }), NSUTF8StringEncoding: "utf8",
        NSData: { dataWithBytesLength: (pointer, length) => data(Buffer.from(pointer.subarray(0, length))) },
        NSString: { alloc: { initWithDataEncoding(bytes) {
            try {
                const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.bytes);
                return { boxed: text, isNil: () => false, dataUsingEncoding: () => data(Buffer.from(text)) };
            } catch { return null; }
        } } }
    };
    return { ns, ref: { equals: (left, right) => left === right }, events, control, record };
}
module.exports = { fakeDirectory };
