"use strict";
const process = require("node:process");
const { serve } = require("./serve.js");

if (process.argv.at(-1) === "--serve") { serve().then((status) => { process.exitCode = status; }, () => { process.exitCode = 1; }); }
else { process.exitCode = 2; }
