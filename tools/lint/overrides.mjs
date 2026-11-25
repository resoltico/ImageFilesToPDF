import { readFromDisk } from "./consistency.mjs";

/*
 * A dependency override must still be doing something, and must say why.
 *
 * Each override in package.json forces a version some dependent does not ask
 * for. Once every dependent's own range accepts that version, the override has
 * become a pin nobody needs, and it would hold the version back silently. So
 * at least one declared range must exclude the override, and CONTRIBUTING.md,
 * which records each override's advisory and removal condition, must name it.
 *
 * Only exact, caret and tilde ranges occur in the lockfile today; any other
 * form fails visibly rather than being guessed at.
 */
const VERSION = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/u;
const RANGE = /^(?<operator>[~^]?)(?<version>\d+\.\d+\.\d+)$/u;

function parts(version, where) {
    const match = VERSION.exec(version);
    if (!match) { throw new Error(`${where}: unsupported version ${version}`); }
    return ["major", "minor", "patch"].map((name) => Number(match.groups[name]));
}

function compare(left, right) {
    return left.map((value, index) => value - right[index]).find((difference) => difference !== 0) ?? 0;
}

export function satisfies(version, range, where = "package-lock.json") {
    const match = RANGE.exec(range);
    if (!match) { throw new Error(`${where}: unsupported range form ${range}`); }
    const wanted = parts(match.groups.version, where);
    const actual = parts(version, where);
    if (match.groups.operator === "") { return compare(actual, wanted) === 0; }
    const [major, minor] = wanted;
    const sameLine = match.groups.operator === "~"
        ? actual[0] === major && actual[1] === minor
        : actual[0] === major && (major > 0 || actual[1] === minor);
    return sameLine && compare(actual, wanted) >= 0;
}

export function declaredRanges(lock, name) {
    return Object.entries(lock.packages).flatMap(([owner, entry]) =>
        ["dependencies", "optionalDependencies", "peerDependencies"]
            .map((kind) => entry[kind]?.[name])
            .filter(Boolean)
            .map((range) => ({ owner: owner || "(root)", range })));
}

export function overrideProblems(manifest, lock, contributing) {
    return Object.entries(manifest.overrides ?? {}).flatMap(([name, version]) => {
        const ranges = declaredRanges(lock, name);
        const problems = [];
        if (ranges.length === 0) { problems.push(`override ${name} has no dependent`); }
        else if (ranges.every(({ owner, range }) => satisfies(version, range, owner))) {
            problems.push(`override ${name}@${version} is already accepted by every dependent; remove it`);
        }
        if (!contributing.includes(`\`${name}\``)) { problems.push(`override ${name} is not documented in CONTRIBUTING.md`); }
        return problems;
    });
}

export async function checkOverrides(read = readFromDisk) {
    const manifest = JSON.parse(await read("package.json"));
    const problems = overrideProblems(manifest, JSON.parse(await read("package-lock.json")), await read("CONTRIBUTING.md"));
    if (problems.length > 0) { throw new Error(problems.join("\n")); }
    return Object.keys(manifest.overrides ?? {}).length;
}
