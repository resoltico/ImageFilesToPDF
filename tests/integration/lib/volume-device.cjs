"use strict";

const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

// Mount paths can disappear before the backing image is detached. Ask DiskImages
// for the whole device belonging to this image, never a cached/reused disk ID.
function imageDevice(snapshot, spellings) {
    if (!Array.isArray(snapshot.images)) {
        throw new Error("DiskImages did not return an images array");
    }
    const matches = snapshot.images.filter((image) => {
        if (typeof image["image-path"] !== "string") {
            throw new Error("DiskImages returned an image without its path");
        }
        return spellings.includes(image["image-path"]) || spellings.includes(image["image-alias"]);
    });
    if (matches.length === 0) {
        return "";
    }
    if (matches.length !== 1 || !Array.isArray(matches[0]["system-entities"])) {
        throw new Error("DiskImages returned ambiguous image identity");
    }
    // APFS also lists a synthesized whole disk. Detach the backing partition
    // map, which owns both the physical store and that synthesized container.
    const devices = matches[0]["system-entities"]
        .filter((entity) => /^(?:GUID|FDisk|Apple)_partition_scheme$/u.test(entity["content-hint"]))
        .map((entity) => entity["dev-entry"])
        .filter((device) => typeof device === "string" && /^\/dev\/disk\d+$/u.test(device));
    if (devices.length !== 1) {
        throw new Error("DiskImages did not identify one whole image device");
    }
    return devices[0];
}

if (require.main === module) {
    const [, , image] = process.argv;
    const plist = execFileSync("hdiutil", ["info", "-plist"]);
    const snapshot = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", "--", "-"], {
        input: plist, encoding: "utf8"
    }));
    process.stdout.write(imageDevice(snapshot, [image, fs.realpathSync(image)]));
}

module.exports = { imageDevice };
