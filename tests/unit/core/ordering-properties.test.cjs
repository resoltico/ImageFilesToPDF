"use strict";

/*
 * The laws a comparator has to obey, which no example can establish.
 *
 * An example says two particular names come out in a particular order. What
 * decides whether sorting works is whether the comparison is consistent with
 * itself across every pair and triple it will ever see: a comparator that says
 * a < b, b < c and c < a hands `Array.prototype.sort` a contradiction, and
 * what comes back then depends on the engine's algorithm and on the order the
 * names happened to arrive in.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fc = require("fast-check");
const { naturalCompare } = require("../../../src/core/ordering.js");

/*
 * Any text at all, and text shaped the way this is decided -- runs of digits
 * beside runs of letters, dots and spaces, and runs of digits long enough to
 * pass 2^53. Text drawn from everything rarely puts a digit beside a letter;
 * text drawn only from the shapes would never try anything else.
 */
const SHAPED = fc.stringMatching(/^[0-9a-cA-C. _-]*$/u);
const LONG_RUN = fc.bigInt({ min: 2n ** 53n }).map(String);
const NAME = fc.oneof(
    fc.string(),
    SHAPED,
    LONG_RUN,
    fc.tuple(SHAPED, LONG_RUN, SHAPED).map((parts) => parts.join(""))
);

// What the comparison treats as one name: case is folded before anything is
// compared, so two spellings that fold to the same text are one name.
function folded(name) {
    return name.toLowerCase();
}

test("a name is equal to itself", () => {
    fc.assert(fc.property(NAME, (name) => {
        assert.equal(naturalCompare(name, name), 0, JSON.stringify(name));
    }));
});

test("reversing the pair reverses the answer, and nothing else", () => {
    // A comparator that is not antisymmetric puts a name before another and
    // after it, depending only on which side it was passed on.
    //
    // Compared with ===, not assert.equal: negating an answer of nought gives
    // -0, and assert.equal uses Object.is, under which 0 and -0 differ -- so
    // a name against itself would read as a broken comparator.
    fc.assert(fc.property(NAME, NAME, (left, right) => {
        const forwards = Math.sign(naturalCompare(left, right));
        const backwards = Math.sign(naturalCompare(right, left));

        assert.ok(
            forwards === -backwards,
            `${JSON.stringify(left)} against ${JSON.stringify(right)}`
        );
    }));
});

test("a sorted list is in order between every pair, not only neighbours", () => {
    // Transitivity, without discarding any input. Sorting consults only the
    // pairs it happens to compare, so a comparison that is not transitive
    // leaves a list whose neighbours agree and whose far ends do not.
    fc.assert(fc.property(fc.array(NAME), (names) => {
        const sorted = [...names].sort(naturalCompare);

        sorted.forEach((earlier, index) => {
            for (const later of sorted.slice(index + 1)) {
                assert.ok(
                    naturalCompare(earlier, later) <= 0,
                    `${JSON.stringify(earlier)} before ${JSON.stringify(later)}`
                );
            }
        });
    }));
});

test("two identifiers a step apart above 2^53 still have an order", () => {
    // Generated as a pair rather than drawn twice, because the failure needs
    // two identifiers that are adjacent: past 2^53 a double cannot hold both,
    // so subtracting them says they are the same name and the page they land
    // on is whichever order they arrived in. Two names drawn independently
    // never collide, so the generator has to have the shape of the risk.
    const ADJACENT = fc.bigInt({ min: 2n ** 53n }).map(
        (value) => [`img${value}.jpg`, `img${value + 1n}.jpg`]
    );

    fc.assert(fc.property(ADJACENT, ([earlier, later]) => {
        assert.ok(naturalCompare(earlier, later) < 0, `${earlier} before ${later}`);
        assert.ok(naturalCompare(later, earlier) > 0, `${later} after ${earlier}`);
    }));
});

test("two names that are not one name get a definite order", () => {
    // Stated this way round, so that nearly every pair counts: two names
    // drawn independently are almost never one name.
    fc.assert(fc.property(NAME, NAME, (left, right) => {
        fc.pre(folded(left) !== folded(right));

        assert.notEqual(
            naturalCompare(left, right),
            0,
            `${JSON.stringify(left)} and ${JSON.stringify(right)} order together`
        );
    }));
});

test("a name and its folded spelling are one name, to everything", () => {
    // Built by folding, rather than by raising the case: "ß" raised is "SS",
    // which folds to "ss", which is a different name.
    fc.assert(fc.property(NAME, NAME, (name, other) => {
        const same = folded(name);

        assert.equal(naturalCompare(name, same), 0, JSON.stringify(name));
        assert.equal(
            Math.sign(naturalCompare(name, other)),
            Math.sign(naturalCompare(same, other)),
            `${JSON.stringify([name, same, other])}`
        );
    }));
});

test("sorting does not depend on the order the names arrived in", () => {
    // Compared as the names the comparison sees. Two spellings of one name
    // keep the order they arrived in -- sorting is stable -- and that is not
    // a different order of anything.
    const ARRIVALS = fc.array(NAME).chain((names) => fc.tuple(
        fc.constant(names),
        fc.shuffledSubarray(names, { minLength: names.length })
    ));

    fc.assert(fc.property(ARRIVALS, ([first, second]) => {
        assert.deepEqual(
            [...second].sort(naturalCompare).map(folded),
            [...first].sort(naturalCompare).map(folded),
            JSON.stringify(first)
        );
    }));
});
