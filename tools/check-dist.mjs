/*
 * Verifies that the committed artifact matches the current source.
 *
 * This must be able to fail, which means it has to run against whatever is
 * already on disk. Never run a build immediately before it: regenerating the
 * artifact first makes the comparison vacuous and lets a stale artifact ship.
 */
import { readFile } from "node:fs/promises";
import {
    artifactPath,
    digestOf,
    manifestPath,
    renderManifest,
    renderRelease
} from "./release.mjs";

const expected = await renderRelease();

async function readArtifact() {
    try {
        return await readFile(artifactPath, "utf8");
    } catch {
        throw new Error(
            "dist artifact is missing; run `npm run build` and commit the result"
        );
    }
}

const actual = await readArtifact();

if (actual !== expected) {
    throw new Error(
        "dist artifact is stale: it does not match src/. Run `npm run build` and commit the result."
    );
}

const digest = digestOf(actual);
const manifest = await readFile(manifestPath, "utf8");
if (manifest !== renderManifest(digest)) {
    throw new Error("dist checksum manifest is stale");
}

console.log(`distribution verified (${digest})`);
