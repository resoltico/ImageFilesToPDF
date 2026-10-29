import { writeFile } from "node:fs/promises";
import { scopedBundle } from "./scoped-bundle.mjs";
import { root } from "./repository.mjs";
const USER_ARGUMENT_START = 2;
const [entry, output] = process.argv.slice(USER_ARGUMENT_START);
if (!entry || !output) { throw new Error("Usage: build-probe.mjs entry output"); }
await writeFile(output, (await scopedBundle(entry, root)).source);
