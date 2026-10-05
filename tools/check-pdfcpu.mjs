/* Check the installed pdfcpu release before running the expensive CI gates. */
import { execFileSync } from "node:child_process";
import {
    isPdfcpuUsable,
    describeSetupProblems
} from "../src/core/preflight.js";

const version = execFileSync("pdfcpu", ["version"], { encoding: "utf8" });
process.stdout.write(version);

if (!isPdfcpuUsable(version)) {
    throw new Error(describeSetupProblems([
        { tool: "pdfcpu", kind: "unusable" }
    ], true));
}
