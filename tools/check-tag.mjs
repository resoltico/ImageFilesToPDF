/*
 * Checks a release tag before anything is published under it.
 *
 * A thin entry point, like check-dist.mjs: the rule itself lives in
 * tools/lint/consistency.mjs where it is unit tested and mutated.
 */
import { checkReleaseTag } from "./lint/consistency.mjs";

// node, the script, then the tag.
const ARGUMENTS_START = 2;

const [tag] = process.argv.slice(ARGUMENTS_START);

if (!tag) {
    throw new Error("usage: node tools/check-tag.mjs <tag>");
}

const version = await checkReleaseTag(tag);

console.log(`release tag ${tag} matches the declared version ${version}`);
