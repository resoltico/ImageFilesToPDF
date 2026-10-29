"use strict";
function workspacePort(app) {
    const text = new Map();
    return {
        pid: 123,
        temporary: "/var/folders/xx/T",
        downloads: "/Downloads/",
        entries(path) {
            const prefix = `${path}/`;
            return [...new Set([...app.files, ...text.keys()].filter((name) => name.startsWith(prefix)).map((name) => name.slice(prefix.length).split("/")[0]))];
        },
        read(path) { if (!text.has(path)) { throw new Error("missing workspace metadata"); } return text.get(path); },
        write(path, value) { text.set(path, value); app.files.add(path); },
        remove(path) { text.delete(path); app.files.delete(path); }
    };
}
module.exports = { workspacePort };
