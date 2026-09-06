/*
 * What CommonJS looks like in a syntax tree.
 *
 * The bundler used to find these by matching lines, which made the build
 * depend on how the sources happened to be formatted: a require indented
 * inside a function, a `module.exports` that was not the last thing in the
 * file, two spaces after `function`. The gate forbids most of that, so nothing
 * was wrong -- but the rules that kept it right lived somewhere else, and a
 * refactor could have moved out from under them.
 *
 * The parser has no such dependence. A statement either is a require
 * declaration or it is not, wherever it sits and however it is spaced.
 */

/*
 * Only an Identifier has a name and only a Literal has a value, so asking for
 * those settles what the node is as well. The one type this does have to ask
 * about is the call itself: everything after it reads through `callee`.
 */
function isRequireCall(node) {
    return node.type === "CallExpression" &&
        node.callee.name === "require" &&
        node.arguments.length === 1 &&
        typeof node.arguments[0].value === "string";
}

/*
 * What the module this one requires is called, or null when the statement is
 * not a require the bundler can remove.
 *
 * Only the destructured form counts. The bundle shares one scope, so
 * `const { a } = require("./b.js")` needs no binding at all -- `a` is already
 * there, contributed by the other module. `const b = require("./b.js")` would
 * bind `b` to an exports object that does not exist once the modules are
 * concatenated, so it is left alone and the residual check refuses it.
 */
function requireTargetOf(statement) {
    if (statement.type !== "VariableDeclaration" ||
        statement.declarations.length !== 1) {
        return null;
    }

    const [declarator] = statement.declarations;

    return declarator.id.type === "ObjectPattern" &&
        isRequireCall(declarator.init)
        ? declarator.init.arguments[0].value
        : null;
}

function isModuleExports(statement) {
    if (statement.type !== "ExpressionStatement" ||
        statement.expression.type !== "AssignmentExpression") {
        return false;
    }

    const { left } = statement.expression;

    return left.object?.name === "module" && left.property?.name === "exports";
}

// Acorn marks a prologue string as a directive, so this is the module's own
// "use strict" rather than any string that happens to say the same thing.
function isUseStrict(statement) {
    return statement.directive === "use strict";
}

/*
 * The statements the bundler removes, and what they required. A require is
 * both: its target has to be bundled already, and the line itself goes.
 */
export function moduleSyntaxIn(program) {
    const requires = [];
    const removed = [];

    for (const statement of program.body) {
        const target = requireTargetOf(statement);

        if (target !== null) {
            requires.push(target);
        }

        if (target !== null || isModuleExports(statement) ||
            isUseStrict(statement)) {
            removed.push(statement);
        }
    }

    return { requires, removed };
}

function namesInPattern(pattern) {
    if (pattern.type === "Identifier") {
        return [pattern.name];
    }

    if (pattern.type === "ObjectPattern") {
        return pattern.properties.flatMap(
            (property) => namesInPattern(property.value)
        );
    }

    if (pattern.type === "ArrayPattern") {
        return pattern.elements.flatMap(
            (element) => (element === null ? [] : namesInPattern(element))
        );
    }

    // A shape nobody has taught this to read would contribute no name, and a
    // name that is not recorded is a collision the bundle will not catch.
    throw new Error(`cannot name a top-level ${pattern.type}`);
}

/*
 * Every name a top-level statement introduces. The bundle shares one scope, so
 * two modules introducing the same name would silently collide.
 */
export function declaredNames(statement) {
    if (statement.type === "FunctionDeclaration" ||
        statement.type === "ClassDeclaration") {
        return [statement.id.name];
    }

    if (statement.type === "VariableDeclaration") {
        return statement.declarations.flatMap(
            (declarator) => namesInPattern(declarator.id)
        );
    }

    return [];
}
