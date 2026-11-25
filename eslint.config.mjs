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
import { areaExceptions, deliberateExceptions, tunedRules } from "./tools/eslint/rules.mjs";

/*
 * The Finder client runs in JavaScriptCore under osascript, not in Node. Its
 * syntax is held to ES2022, which the JavaScriptCore of the macOS floor
 * (Safari 16.6, tools/finder-floor.mjs) supports in full; tools and tests run
 * on Node 26. tools/lint/language-target.mjs checks the built-ins.
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

    {
        // A directive that suppresses nothing is a stale exception.
        linterOptions: { reportUnusedDisableDirectives: "error", reportUnusedInlineConfigs: "error" },
        rules: { ...deliberateExceptions, ...tunedRules }
    },

    {
        // Portable planning core: CommonJS for Node, isolated by esbuild for JXA.
        files: ["src/core/**/*.js", "src/application/**/*.js", "src/backend/**/*.js", "src/entry.js"],
        languageOptions: {
            ecmaVersion: JXA_ECMA_VERSION,
            sourceType: "commonjs",
            globals: commonjsGlobals
        }
    },

    {
        // macOS host layer: the same, plus the JavaScriptCore globals.
        files: ["src/finder/**/*.js"],
        languageOptions: {
            ecmaVersion: JXA_ECMA_VERSION,
            sourceType: "commonjs",
            globals: { ...commonjsGlobals, ...jxaGlobals }
        }
    },

    {
        files: ["src/engine/**/*.js", "src/cli/**/*.js", "src/serve/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",
            globals: commonjsGlobals
        }
    },
    {
        // Build and QA tooling: ESM on Node.
        files: ["tools/**/*.mjs", "eslint.config.mjs", "stryker.config.mjs"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: nodeGlobals
        }
    },

    {
        files: ["tests/**/*.cjs", "tests/**/*.js", "tools/tests/**/*.cjs"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",
            globals: { ...commonjsGlobals, ...jxaGlobals, globalThis: "writable" }
        }
    },

    ...areaExceptions
];
