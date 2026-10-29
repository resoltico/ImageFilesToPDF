"use strict";
const { Buffer } = require("node:buffer");
const { TextDecoder } = require("node:util");
const { createFakeObjC } = require("./fake-objc.cjs");

function attributesFor(app, path) {
    if (!app.files.has(path)) { return null; }
    const facts = app.publication.facts(path);
    const [device, number] = facts.identity.split(":");
    const plain = { NSFileType: "NSFileTypeRegular", NSFileSystemNumber: Number(device), NSFileSystemFileNumber: Number(number) };
    const values = { kind: "NSFileTypeRegular", size: facts.size, device, number };
    return { plain, isNil: () => false,
        objectForKey: (key) => Object.hasOwn(values, key) ? { boxed: values[key], stringValue: String(values[key]) } : { timeIntervalSince1970: 1 } };

}

function managerFor(app, unbox) {
    return {
        contentsOfDirectoryAtPathError(path) {
            const prefix=`${unbox(path)}/`;
            const names=[...new Set([...app.files].filter((name)=>name.startsWith(prefix)).map((name)=>name.slice(prefix.length).split("/")[0]))];
            names.isNil=()=>false;return names;
        },
        removeItemAtPathError(path) {app.files.delete(unbox(path));app.fileTexts.delete(unbox(path));return true;},
        isReadableFileAtPath: (path) => app.files.has(unbox(path)) || app.fileTexts.has(unbox(path)),
        currentDirectoryPath: "/cwd",
        fileExistsAtPathIsDirectory(path, directory) { const name = unbox(path); directory[0] = false; return app.files.has(name) || app.fileTexts.has(name); },
        attributesOfItemAtPathError: (path) => attributesFor(app, unbox(path)),
        copyItemAtPathToPathError(from, to) { app.sources.capture(unbox(from), unbox(to)); return true; },
        linkItemAtPathToPathError(from, to, error) {
            const outcome = app.publication.link(unbox(from), unbox(to));
            Object.assign(error, { code: 516, domain: "NSCocoaErrorDomain", localizedDescription: "exists", userInfo: { objectForKey: () => ({ isNil: () => true }) } });
            return outcome.state === "created";
        }
    };
}

function fileData(bytes) {
    return { bytes, length: bytes.length, isNil: () => false,
        subdataWithRange: (range) => fileData(bytes.subarray(range.location, range.location + range.length)),
        base64EncodedStringWithOptions: () => ({ boxed: bytes.toString("base64") }) };
}

function decodedText(data) {
    try { return { boxed: new TextDecoder("utf-8", { fatal: true }).decode(data.bytes), isNil: () => false }; }
    catch { return null; }
}

function installPlatform(app, options = {}) {
    const bridge = createFakeObjC(options);
    const output = [];
    const stderr = [];
    const unbox = (value) => value?.boxed ?? value;
    const ns = (value) => ({ boxed: value, objectForKey: (key) => value[unbox(key)], stringByStandardizingPath: value, dataUsingEncoding: () => value,
        writeToFileAtomicallyEncodingError(path) {app.fileTexts.set(unbox(path),value);app.files.add(unbox(path));return true;} });
    Object.assign(ns, bridge.ns, {
        NSMakeRange: (location, length) => ({ location, length }),
        NSData: { dataWithContentsOfFile: (path) => app.fileTexts.has(unbox(path)) ? fileData(Buffer.from(app.fileTexts.get(unbox(path)))) : null },
        NSString: { alloc: { initWithDataEncoding: decodedText },
            stringWithContentsOfFileEncodingError: (path) => app.fileTexts.has(unbox(path)) ? {boxed:app.fileTexts.get(unbox(path)),isNil:()=>false} : null },
        NSTemporaryDirectory: () => "/var/folders/xx/T/", NSHomeDirectory: () => "/",
        NSProcessInfo: {processInfo:{processIdentifier:123}},
        NSFileManager: { defaultManager: managerFor(app, unbox) },
        NSWorkspace: { sharedWorkspace: { isFilePackageAtPath: () => false } },
        NSFileType: "kind", NSFileSystemNumber: "device", NSFileSystemFileNumber: "number", NSFileSize: "size", NSFileModificationDate: "modified", NSFileCreationDate: "created",
        NSURL: { fileURLWithPath: (path) => path },
        CGImageSourceCreateWithURL: () => ({}), CGImageSourceGetCount: () => app.pages ?? 1,
        CFRelease: () => undefined,
        exit: (code) => code,
        NSFileHandle: { fileHandleWithStandardOutput: { writeData: (text) => output.push(text) }, fileHandleWithStandardError: { writeData: (text) => stderr.push(text) } }
    });
    Object.assign(bridge.objc, { deepUnwrap: (value) => value?.plain ?? value, unwrap: unbox,
        bindFunction: () => undefined, castRefToObject: () => ({ isNil: () => false }) });
    Object.assign(globalThis, { ObjC: bridge.objc, $: ns, Ref: () => ({}),
        Application: Object.assign(() => ({selection:()=>["/source.png"]}),{currentApplication:()=>app}) });
    return { ...bridge, ns, output, stderr };
}
module.exports = { installPlatform };
