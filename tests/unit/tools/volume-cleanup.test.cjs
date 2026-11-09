"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { imageDevice } = require("../../integration/lib/volume-device.cjs");

const ROOT = path.resolve(__dirname, "../../..");
const IMAGE = "/owned/image & test.dmg";
const attached = (image = IMAGE, device = "/dev/disk42") => ({
    "image-path": image,
    "system-entities": [{ "dev-entry": device, "content-hint": "GUID_partition_scheme" }, { "dev-entry": `${device}s1` }]
});

test("image identity selects its whole device, including an unmounted image", () => {
    assert.equal(imageDevice({ images: [attached("/other.dmg"), attached()] }, [IMAGE]), "/dev/disk42");
    assert.equal(imageDevice({ images: [attached("/other.dmg")] }, [IMAGE]), "");
    assert.equal(imageDevice({ images: [] }, [IMAGE]), "");
    assert.equal(imageDevice({ images: [{ ...attached("/var/image.dmg"), "image-alias": IMAGE }] }, [IMAGE]), "/dev/disk42");
});

test("unknown or ambiguous image/device identity cannot establish detachment", () => {
    for (const snapshot of [{}, { images: [{}] }, { images: [attached(), attached()] },
        { images: [{ "image-path": IMAGE }] }, { images: [attached(IMAGE, "/dev/disk42s1")] },
        { images: [{ ...attached(), "system-entities": [{ "dev-entry": "/dev/disk42" }] }] },
        { images: [{ ...attached(), "system-entities": [...attached()["system-entities"], ...attached(IMAGE, "/dev/disk43")["system-entities"]] }] }]) {
        assert.throws(() => imageDevice(snapshot, [IMAGE]));
    }
});

test("APFS synthesized disks cannot be mistaken for the backing partition map", () => {
    const image = attached();
    image["system-entities"].push({ "dev-entry": "/dev/disk43", "content-hint": "EF57347C-0000-11AA-AA11-00306543ECAC" });
    assert.equal(imageDevice({ images: [image] }, [IMAGE]), "/dev/disk42");
    for (const scheme of ["FDisk_partition_scheme", "Apple_partition_scheme"]) {
        image["system-entities"][0]["content-hint"] = scheme;
        assert.equal(imageDevice({ images: [image] }, [IMAGE]), "/dev/disk42");
    }
});

function cleanupRun(mode) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "iftp-cleanup-test-"));
    const image = path.join(work, "owned & image.dmg");
    fs.writeFileSync(image, "owned image");
    fs.writeFileSync(path.join(work, "attached"), "");
    fs.writeFileSync(path.join(work, "snapshot"), JSON.stringify({ images: [attached("/other.dmg", "/dev/disk9"), attached(image)] }));
    fs.writeFileSync(path.join(work, "absent"), JSON.stringify({ images: [attached("/other.dmg", "/dev/disk9")] }));
    fs.writeFileSync(path.join(work, "calls"), "");
    const scripts = {
        hdiutil: `#!/bin/bash
set -eu
if [ "$1" = info ]; then
    if [ "$MODE" = info-error ]; then exit 2; fi
    if [ "$MODE" = malformed ]; then printf '{}'; exit 0; fi
    if [ -e "$FIXTURE/attached" ]; then cat "$FIXTURE/snapshot"; else cat "$FIXTURE/absent"; fi
else
    printf '%s\\n' "$*" >> "$FIXTURE/calls"
    if [ "$MODE" = busy ]; then exit 1; fi
    if [ "$MODE" = force ] && [ "$2" != -force ]; then exit 1; fi
    rm -f "$FIXTURE/attached"
    if [ "$MODE" = disappeared ]; then exit 1; fi
fi
`,
        plutil: "#!/bin/bash\ncat\n",
        sleep: "#!/bin/bash\nexit 0\n"
    };
    for (const [name, content] of Object.entries(scripts)) {
        fs.writeFileSync(path.join(work, name), content, { mode: 0o700 });
    }
    if (mode === "absent") {
        fs.unlinkSync(path.join(work, "attached"));
    }
    try {
        const result = spawnSync("bash", ["-c", 'set -euo pipefail; source "$ROOT/tests/integration/lib/volume.sh"; detach_test_volume "$FIXTURE/missing-mount" "$IMAGE"'], {
            encoding: "utf8", env: { ...process.env, ROOT, FIXTURE: work, IMAGE: image, MODE: mode, PATH: `${work}:${process.env.PATH}` }
        });
        assert.ifError(result.error);
        return { status: result.status, stderr: result.stderr, calls: fs.readFileSync(path.join(work, "calls"), "utf8").trim().split("\n").filter(Boolean) };
    } finally {
        fs.rmSync(work, { recursive: true, force: true });
    }
}

for (const mode of ["normal", "disappeared", "absent", "force"]) {
    test(`cleanup verifies the owned image is gone: ${mode}`, () => {
        const result = cleanupRun(mode);
        assert.equal(result.status, 0, result.stderr);
        const attempts = { absent: 0, force: 6, normal: 1, disappeared: 1 };
        assert.equal(result.calls.length, attempts[mode]);
        assert.ok(result.calls.every((call) => call.endsWith("/dev/disk42")));
        if (mode === "force") {
            assert.equal(result.calls.at(-1), "detach -force /dev/disk42");
        }
    });
}

test("persistent attachment fails after bounded retries, including a force attempt", () => {
    const result = cleanupRun("busy");
    assert.equal(result.status, 1);
    assert.equal(result.calls.length, 6);
    assert.match(result.stderr, /Could not detach test image/u);
});

for (const mode of ["info-error", "malformed"]) {
    test(`cleanup fails without detaching anything when attachment evidence is ${mode}`, () => {
        const result = cleanupRun(mode);
        assert.equal(result.status, 1);
        assert.deepEqual(result.calls, []);
    });
}
