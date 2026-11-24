"use strict";
const assert = require("node:assert/strict");
const { Buffer } = require("node:buffer");
const fs = require("node:fs");
const path = require("node:path");
const { windowsNative } = require("../../src/engine/platform/win32.js");
const { localFilesystem } = require("../../src/engine/filesystem.js");
const { destinationOperations } = require("../../src/engine/publication.js");

async function main() {
    const [, , volume] = process.argv;
    using fixture = fs.mkdtempDisposableSync(path.join(volume, "iftp-claim-control-"));
    const source = path.join(fixture.path, "verified original.pdf");
    const from = path.join(fixture.path, "staging", "ready.pdf");
    const to = path.join(fixture.path, "résumé 文章.pdf");
    const away = path.join(fixture.path, "moved aside.pdf");
    const body = Buffer.from("Synthetic content shared by the original and replacement.");
    fs.mkdirSync(path.dirname(from));
    fs.writeFileSync(source, body, { flag: "wx" });
    fs.copyFileSync(source, from, fs.constants.COPYFILE_EXCL);
    const helper = windowsNative({ stopped: () => false });
    const files = localFilesystem(helper, null);
    const injected = {
        async move(staged, final) {
            const claimed = await helper.move(staged, final);
            assert.equal(claimed.ok, true, JSON.stringify(claimed));
            const displaced = await helper.move(final, away);
            assert.equal(displaced.ok, true, JSON.stringify(displaced));
            fs.copyFileSync(away, final, fs.constants.COPYFILE_EXCL);
            return claimed;
        }
    };
    try {
        const { publication } = destinationOperations(files, null, injected);
        const original = publication.facts(source);
        const outcome = await publication.rename(from.replaceAll("\\", "/"), to.replaceAll("\\", "/"));
        assert.equal(outcome.state, "unknown", JSON.stringify(outcome));
        assert.equal(outcome.diagnostic?.ok, true, "the real native move and replacement must occur");
        assert.deepEqual(publication.facts(source), original);
        assert.deepEqual(fs.readFileSync(to), body);
        assert.deepEqual(fs.readFileSync(away), body);
        assert.notEqual(publication.facts(to).identity, publication.facts(away).identity);
        process.stdout.write("The exclusive native move refused confirmation of a same-byte replacement.\n");
    } finally { await helper.close(); }
}
main().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
