import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Where this repository is, and nothing else.
 *
 * A leaf on purpose. It used to live in release.mjs, which is also the
 * builder, so anything that merely wanted to resolve a path imported the
 * builder -- and once the builder learned to parse JavaScript, every one of
 * them needed acorn to be installed. The release workflow's publishing job
 * deliberately installs nothing: it holds the write and signing permissions,
 * so the less code that runs there the better. It reads the release notes out
 * of CHANGELOG.md, that reached this constant through four modules, and the
 * release failed at the last step for a dependency none of it uses.
 */
export const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);
