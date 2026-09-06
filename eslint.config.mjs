/*
 * ESLint configuration — strictest mode.
 *
 * The base is `js.configs.all`, which enables every core ESLint rule rather
 * than the curated `recommended` subset. `all` is not version-stable: a new
 * rule in a later release turns on by itself. That is why eslint is pinned to
 * an exact version in package.json and moved deliberately through Dependabot.
 *
 * The globals and the rule adjustments live in tools/eslint/; this file only
 * assembles them per area of the tree.
 */
import js from "@eslint/js";
import {
    nodeGlobals,
    commonjsGlobals,
    jxaGlobals
} from "./tools/eslint/globals.mjs";
import { deliberateExceptions, tunedRules } from "./tools/eslint/rules.mjs";

/*
 * src/ runs in JavaScriptCore under osascript, not in Node. Its syntax is
 * pinned to what macOS 12.3's engine (Safari 15.4) supports; tools and tests
 * run on Node 26 and are not constrained.
 *
 * No ECMAScript year maps exactly onto a Safari release, so this is the coarse
 * half of the check. tools/lint/language-target.mjs is the precise half.
 */
const JXA_ECMA_VERSION = 2022;

export default [
    {
        ignores: [
            "dist/**",
            "node_modules/**",
            // Stryker copies the tree into a sandbox to mutate it.
            ".stryker-tmp/**",
            "reports/**"
        ]
    },

    js.configs.all,

    { rules: { ...deliberateExceptions, ...tunedRules } },

    {
        // Portable planning core: CommonJS for Node, concatenated for JXA.
        files: ["src/core/**/*.js"],
        languageOptions: {
            ecmaVersion: JXA_ECMA_VERSION,
            sourceType: "commonjs",
            globals: commonjsGlobals
        }
    },

    {
        // macOS host layer: the same, plus the JavaScriptCore globals.
        files: ["src/runtime/**/*.js"],
        languageOptions: {
            ecmaVersion: JXA_ECMA_VERSION,
            sourceType: "commonjs",
            globals: { ...commonjsGlobals, ...jxaGlobals }
        }
    },

    {
        // Build and QA tooling: ESM on Node.
        files: ["tools/**/*.mjs", "eslint.config.mjs"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: nodeGlobals
        },
        rules: {
            // The gate reports its progress on stdout.
            "no-console": "off",
            // Checks run in sequence on purpose: the first failure should stop
            // the gate rather than racing every file at once.
            "no-await-in-loop": "off"
        }
    },

    {
        files: ["tests/**/*.cjs"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",
            globals: { ...commonjsGlobals, ...jxaGlobals, globalThis: "writable" }
        },
        rules: {
            // Test fixtures are literal on purpose: naming 2480 as a constant
            // derived from the same source as the code under test would make
            // the assertion tautological.
            "no-magic-numbers": "off"
        }
    }
];
