/*
 * Why a renamed binding cannot survive.
 *
 * `const { a: b } = require("./c.js")` asks for a name the concatenated scope
 * does not have: `a` is what the other module declared, and `b` was only ever
 * a local alias. Nothing else notices -- the require line goes, the residual
 * check finds no require and no export, the gate passes, every unit test
 * passes because Node still resolves the alias, and the artifact fails on a
 * user's Mac with "Can't find variable". The same goes for a default, a rest
 * element or a nested pattern: none of them name something the bundle has.
 */
function bindingProblem(property) {
    if (property.type !== "Property" || property.value.type !== "Identifier") {
        return "is not a plain binding";
    }

    return property.key.name === property.value.name
        ? ""
        : `renames ${property.key.name} to ${property.value.name}`;
}

export function assertPlainBindings(pattern, target) {
    for (const property of pattern.properties) {
        const problem = bindingProblem(property);

        if (problem) {
            throw new Error(
                `the require of ${target} ${problem}; the bundle shares one ` +
                "scope, so the only name available is the one the other " +
                "module declared -- rename it at the source instead"
            );
        }
    }
}

