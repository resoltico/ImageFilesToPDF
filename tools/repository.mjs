import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve repository paths without importing build dependencies.

export const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);
