/*
 * Adjustments to `js.configs.all`.
 *
 * Every entry states why it does not apply here. Nothing is relaxed in bulk,
 * and the reconfigured rules stay errors rather than being switched off.
 */

const MAXIMUM_PARAMETERS = 4;

/*
 * Rules from `all` that are switched off deliberately.
 */
export const deliberateExceptions = {
    // Contradicts `no-var` and `init-declarations`: requires a single combined
    // declaration per scope, which forces uninitialised variables.
    "one-var": "off",
    // Requires alphabetical object keys. Settings, geometry and argv objects
    // are ordered semantically, which carries more meaning than the alphabet.
    "sort-keys": "off",
    // Requires alphabetical imports. Imports are grouped by dependency layer,
    // which mirrors the bundle order.
    "sort-imports": "off",
    // Ternaries express short either/or values; banning them outright would
    // force longer, less readable branching.
    "no-ternary": "off",
    // Comment style here is sentence-cased prose in block comments and
    // lowercase fragments inline; both are intentional.
    "capitalized-comments": "off",
    // `undefined` is compared against directly when distinguishing an absent
    // array element from a present falsy one.
    "no-undefined": "off"
};

/*
 * Rules kept as errors but tuned to this codebase.
 */
export const tunedRules = {
    // Function declarations, consistently. `all` defaults to expressions;
    // declarations read better in a concatenated script and they hoist, which
    // the bundle relies on.
    "func-style": ["error", "declaration", { allowArrowFunctions: true }],
    // 0, 1 and -1 are index arithmetic and comparator results, not magic
    // values. Every number encoding a real decision must still be named.
    "no-magic-numbers": [
        "error",
        { ignore: [-1, 0, 1], ignoreArrayIndexes: true, enforceConst: true }
    ],
    /*
     * Four, not the aggressive default of three.
     *
     * This was checked rather than assumed: at three, thirteen functions
     * object, and all thirteen are naturally four-part — a tool path, an
     * input, an output and a spec, or a value with a range and a label.
     * Wrapping those in an options object reads worse, not better.
     *
     * The check did earn its keep once: it exposed a dead `label` parameter on
     * testPath that only fed an error message the caller discarded. Anything
     * above four still takes an object; nothing in the tree exceeds four.
     */
    "max-params": ["error", MAXIMUM_PARAMETERS],
    /*
     * Path() and Application() are JavaScriptCore host APIs that are
     * capitalised but are not constructors. The NS-prefixed exceptions are
     * Foundation and AppKit C functions bridged by JXA -- NSMakeRect,
     * NSMakeSize, NSSelectorFromString -- which Apple capitalises by
     * convention and which likewise construct nothing. The optional
     * qualifier is there because the rule matches the whole callee text, so
     * the namespace they are reached through is part of the name.
     */
    "new-cap": [
        "error",
        {
            capIsNewExceptions: ["Path", "Application"],
            capIsNewExceptionPattern: "^(?:[\\w$]+\\.)*NS"
        }
    ],
    /*
     * "$" is the name JXA gives the ObjC bridge namespace. It is fixed by the
     * host, so the only alternative to excepting it is aliasing every use.
     */
    "id-length": ["error", { exceptions: ["$"] }]
};
