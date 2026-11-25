/*
 * The oldest macOS the Finder action supports, and the JavaScriptCore it runs
 * on there.
 *
 * The floor is Node.js 26's: its platform list requires macOS 13.5, and the
 * Finder action runs its engine in Node. macOS 13.5 shipped Safari 16.6, whose
 * JavaScriptCore is the engine osascript uses, so that is the language the
 * Finder client is compiled for and checked against. Later Safari updates do
 * not count: the floor is what the OS release itself carries.
 */
export const MINIMUM_MACOS = "13.5";
export const FINDER_JAVASCRIPTCORE = "safari16.6";
