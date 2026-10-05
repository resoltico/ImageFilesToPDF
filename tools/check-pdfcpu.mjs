/* Check the installed pdfcpu release before running the expensive CI gates. */
import { execFileSync } from "node:child_process";
import {
    isPdfcpuUsable,
    describeSetupProblems
} from "../src/core/preflight.js";
import { PDFCPU_PIXEL_LIMIT } from "../src/core/limits.js";

const version = execFileSync("pdfcpu", ["version"], { encoding: "utf8" });
process.stdout.write(version);

if (!isPdfcpuUsable(version)) {
    throw new Error(describeSetupProblems([
        { tool: "pdfcpu", kind: "unusable" }
    ], true));
}

const configuration = JSON.parse(execFileSync("pdfcpu", [
    "--conf", "disable", "config", "inspect", "--json"
], { encoding: "utf8" }));

if (configuration.limits?.maxImagePixels !== PDFCPU_PIXEL_LIMIT) {
    throw new Error("pdfcpu's stateless image pixel limit differs from the supported DPI ceiling.");
}

console.log(`Stateless image pixel limit: ${PDFCPU_PIXEL_LIMIT}`);
