/*
 * Globals are declared explicitly rather than by pulling in the `globals`
 * package, to keep the dependency surface as small as the rest of the
 * project's.
 */

export const nodeGlobals = {
    console: "readonly",
    process: "readonly",
    URL: "readonly",
    TextEncoder: "readonly",
    TextDecoder: "readonly"
};

export const commonjsGlobals = {
    ...nodeGlobals,
    __dirname: "readonly",
    __filename: "readonly",
    exports: "writable",
    module: "writable",
    require: "readonly"
};

/*
 * Supplied by JavaScriptCore under osascript, not by Node.
 */
export const jxaGlobals = {
    Application: "readonly",
    Library: "readonly",
    ObjC: "readonly",
    $: "readonly",
    Path: "readonly",
    Progress: "writable",
    delay: "readonly"
};
