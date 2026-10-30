"use strict";
const { Buffer } = require("node:buffer");
const { TextDecoder } = require("node:util");
const { createFakeObjC } = require("./fake-objc.cjs");

function attributesFor(app, path) {
    const prefix=`${path.replace(/\/$/u,"")}/`;
    const directory=app.nativeDirectories?.has(path)||[...app.files].some((name)=>name.startsWith(prefix));
    if(directory) {
        const ids=app.nativeDirectoryIds;
        if(!ids.has(path)) {ids.set(path,String(100000+ids.size));}
        const fields={kind:"NSFileTypeDirectory",device:"1",number:ids.get(path)};
        return {plain:{NSFileType:"NSFileTypeDirectory"},isNil:()=>false,objectForKey:(key)=>({boxed:fields[key],stringValue:fields[key]})};
    }
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
        createDirectoryAtPathWithIntermediateDirectoriesAttributesError(path) {
            const name=unbox(path);
            if(attributesFor(app,name)) {return false;}
            app.nativeDirectories.add(name);return true;
        },
        removeItemAtPathError(path) {
            const name=unbox(path);
            for(const directory of app.nativeDirectories) {if(directory===name||directory.startsWith(`${name}/`)) {app.nativeDirectories.delete(directory);}}
            app.files.delete(name);app.fileTexts.delete(name);return true;
        },
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
    app.nativeDirectories=new Set();app.nativeDirectoryIds=new Map();
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
        NSURLVolumeSupportsCaseSensitiveNamesKey:"caseSensitive", NSURLCanonicalPathKey:"canonicalPath",
        NSURL: {fileURLWithPath(path) {
            const name=unbox(path);
            const url={path:name,resourceValuesForKeysError:()=>({isNil:()=>false,objectForKey:(key)=>({boxed:key==="caseSensitive"?true:name,isNil:()=>false})})};
            url.URLByResolvingSymlinksInPath=url;return url;
        }},
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
