"use strict";
function nativeAttributes(values) {
    if (values === null || values === undefined) { return null; }
    return { isNil: () => false, objectForKey(key) {
        const value = values[key];
        return { boxed: value, stringValue: String(value), timeIntervalSince1970: value };
    } };
}
module.exports = { nativeAttributes };
