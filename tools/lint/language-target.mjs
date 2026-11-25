import { embeddedEngineIn } from "../embedded-engine.mjs";
import { ECMASCRIPT_TARGET, MINIMUM_MACOS, renderRelease } from "../release.mjs";

/*
 * The released artifact runs in JavaScriptCore under osascript, whose feature
 * set is fixed by the user's macOS version. ESLint's `ecmaVersion` constrains
 * syntax, but a late *built-in* is ordinary syntax calling an ordinary method,
 * so nothing in a parser will flag it. It fails at runtime, on the user's Mac,
 * with a TypeError.
 *
 * The Finder client is compiled for the JavaScriptCore of the macOS floor
 * (tools/finder-floor.mjs). Each entry names the first JavaScriptCore release
 * that has a built-in the floor lacks.
 *
 * Known gap: regular-expression *flags* are not inspected, so the ES2024 `v`
 * flag would not be caught here. ESLint requires every regex to carry `u`,
 * which makes an accidental `v` unlikely.
 */
export const LATE_FEATURES = [
    ["Object.groupBy(", "Safari 17.4 / macOS 14.4", "a plain reduce"],
    ["Map.groupBy(", "Safari 17.4 / macOS 14.4", "a plain reduce"],
    ["Promise.withResolvers(", "Safari 17.4 / macOS 14.4", "an explicit executor"],
    [".union(", "Safari 17 / macOS 14", "an explicit Set loop"],
    [".intersection(", "Safari 17 / macOS 14", "an explicit Set loop"],
    [".difference(", "Safari 17 / macOS 14", "an explicit Set loop"],
    [".symmetricDifference(", "Safari 17 / macOS 14", "an explicit Set loop"],
    [".isSubsetOf(", "Safari 17 / macOS 14", "an explicit Set loop"],
    [".isSupersetOf(", "Safari 17 / macOS 14", "an explicit Set loop"],
    [".isDisjointFrom(", "Safari 17 / macOS 14", "an explicit Set loop"],
    ["Promise.try(", "Safari 18.2 / macOS 15.2", "a new Promise around the call"],
    ["RegExp.escape(", "Safari 18.2 / macOS 15.2", "a manual escape"],
    ["structuredClone(", "a Web API absent from osascript", "an explicit copy"]
];

export function findLateFeatures(release, features = LATE_FEATURES) {
    if (features.length === 0) {
        throw new Error("the language target has no features left to reject");
    }

    return features.filter(([token]) => release.includes(token));
}

export function checkFeatures(release) {
    const found = findLateFeatures(release);

    if (found.length > 0) {
        const detail = found
            .map(([token, since, instead]) =>
                `  ${token} requires ${since}; use ${instead}`)
            .join("\n");

        throw new Error(
            `released artifact exceeds its JavaScriptCore target on macOS ` +
            `${MINIMUM_MACOS} (ES${ECMASCRIPT_TARGET}):\n${detail}`
        );
    }

    return `ES${ECMASCRIPT_TARGET}, macOS ${MINIMUM_MACOS}+`;
}

export async function checkLanguageTarget(render = renderRelease) {
    const release = await render();
    const engine = embeddedEngineIn(release, ECMASCRIPT_TARGET);
    // The engine's source is data in JavaScriptCore and executable code only in Node.
    const finder = engine ? `${release.slice(0, engine.start)}""${release.slice(engine.end)}` : release;
    return checkFeatures(finder);
}
