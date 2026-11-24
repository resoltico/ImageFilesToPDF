"use strict";

/*
 * Every binary this action runs, and the only place any of them is named.
 *
 * The external surface of the artifact is two things: the system tools below,
 * at absolute paths because a PATH lookup is neither needed nor trustworthy
 * for them, and vips, vipsheader and pdfcpu, which are located at run time and
 * named by TOOL_NAMES in src/host/tools.js.
 *
 * Collected here so that surface is a file you can read rather than a fact you
 * have to reassemble from five modules. Adding a binary is then a visible edit
 * to a list, which is the honest form of the boundary a policy check over the
 * built artifact was trying to approximate by pattern-matching strings.
 */

const PS = "/bin/ps";
const CP = "/bin/cp";
const MKDIR = "/bin/mkdir";
const RM = "/bin/rm";
const RMDIR = "/bin/rmdir";
const TEST = "/bin/test";
const MKTEMP = "/usr/bin/mktemp";
const PRINTENV = "/usr/bin/printenv";

const EXECUTABLES = [
    PS, CP, MKDIR, RM, RMDIR, TEST, MKTEMP, PRINTENV
];

module.exports = {
    PS,
    CP,
    MKDIR,
    RM,
    RMDIR,
    TEST,
    MKTEMP,
    PRINTENV,
    EXECUTABLES
};
