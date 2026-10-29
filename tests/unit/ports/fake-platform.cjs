"use strict";
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
        attributesOfItemAtPathError: (path) => attributesFor(app, unbox(path)),
        copyItemAtPathToPathError(from, to) { app.sources.capture(unbox(from), unbox(to)); return true; },
        linkItemAtPathToPathError(from, to, error) {
            const outcome = app.publication.link(unbox(from), unbox(to));
            Object.assign(error, { code: 516, domain: "NSCocoaErrorDomain", localizedDescription: "exists", userInfo: { objectForKey: () => ({ isNil: () => true }) } });
            return outcome.state === "created";
        }
    };
}

function installPlatform(app, options = {}) {
    const bridge = createFakeObjC(options);
    const output = [];
    const stderr = [];
    const unbox = (value) => value?.boxed ?? value;
    const ns = (value) => ({ boxed: value, stringByStandardizingPath: value, dataUsingEncoding: () => value });
    Object.assign(ns, bridge.ns, {
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
