"use strict";

/*
 * The laws a comparator has to obey, which no example can establish.
 *
 * An example says two particular names come out in a particular order. What
 * decides whether sorting works is whether the comparison is consistent with
 * itself across every pair and triple it will ever see: a comparator that says
 * a < b, b < c and c < a hands `Array.prototype.sort` a contradiction, and
 * what comes back then depends on the engine's algorithm and on the order the
 * names happened to arrive in. Nothing in a list of examples can rule that
 * out.
 *
 * The names are generated from an alphabet that is mostly digits, letters,
 * dots and spaces, because that is what makes segment boundaries -- and the
 * boundaries are where this is decided. Long runs of digits are generated
 * beside them, because a run past 2^53 is where the comparison stops being
 * exact and two different names start comparing equal, and a short alphabet
 * never reaches one.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fc = require("fast-check");
const { naturalCompare } = require("../../../src/core/ordering.js");

const RUNS = { seed: 20260916, numRuns: 50 };

const SHORT = fc.stringMatching(/^[0-9a-cA-C. _-]{0,8}$/u);
const LONG_RUN = fc.stringMatching(/^[19]\d{15,19}$/u);
const NAME = fc.oneof(
    { arbitrary: SHORT, weight: 3 },
    { arbitrary: LONG_RUN, weight: 1 },
    { arbitrary: fc.tuple(SHORT, LONG_RUN, SHORT).map((parts) => parts.join("")), weight: 1 }
);

function sign(value) {
    return Math.sign(value);
}

test("a name is equal to itself", () => {
    fc.assert(fc.property(NAME, (name) => {
        assert.equal(naturalCompare(name, name), 0, JSON.stringify(name));
    }), RUNS);
});

test("reversing the pair reverses the answer, and nothing else", () => {
    // A comparator that is not antisymmetric puts a name before another and
    // after it, depending only on which side it was passed on.
    fc.assert(fc.property(NAME, NAME, (left, right) => {
        assert.equal(
            sign(naturalCompare(left, right)),
            -sign(naturalCompare(right, left)),
            `${JSON.stringify(left)} against ${JSON.stringify(right)}`
        );
    }), RUNS);
});

test("an order that holds across two pairs holds across the third", () => {
    // Transitivity. Without it sort() has a contradiction to resolve and what
    // it returns depends on its own algorithm.
    fc.assert(fc.property(NAME, NAME, NAME, (one, two, three) => {
        fc.pre(naturalCompare(one, two) <= 0 && naturalCompare(two, three) <= 0);

        assert.ok(
            naturalCompare(one, three) <= 0,
            `${JSON.stringify([one, two, three])}`
        );
    }), RUNS);
});

test("two identifiers a step apart above 2^53 still have an order", () => {
    // Generated as a pair rather than drawn twice, because the failure needs
    // two identifiers that are adjacent: past 2^53 a double cannot hold both,
    // so subtracting them says they are the same name and the page they land
    // on is whichever order they arrived in. Two names drawn independently
    // never collide, so a generic generator never reaches this at all -- the
    // generator has to have the shape of the risk.
    const ADJACENT = fc.bigInt({ min: 2n ** 53n, max: 2n ** 70n }).map(
        (value) => [`img${value}.jpg`, `img${value + 1n}.jpg`]
    );

    fc.assert(fc.property(ADJACENT, ([earlier, later]) => {
        assert.ok(naturalCompare(earlier, later) < 0, `${earlier} before ${later}`);
        assert.ok(naturalCompare(later, earlier) > 0, `${later} after ${earlier}`);
    }), RUNS);
});

test("two names that are not one name get a definite order", () => {
    // Stated this way round rather than as "what compares equal is the same
    // name": two names drawn independently are almost never equal, so the
    // precondition that way round rejects nearly everything and the property
    // never runs. This one holds for almost every pair.
    //
    // It is where comparing digit runs as JavaScript numbers fails: past 2^53
    // two different identifiers become one value, subtracting them says they
    // are the same name, and the page they land on is whichever order they
    // arrived in.
    fc.assert(fc.property(NAME, NAME, (left, right) => {
        fc.pre(left.toLowerCase() !== right.toLowerCase());

        assert.notEqual(
            naturalCompare(left, right),
            0,
            `${JSON.stringify(left)} and ${JSON.stringify(right)} order together`
        );
    }), RUNS);
});

test("case is the only difference a name may have and still compare equal", () => {
    // The equivalence the folding creates, asserted from the other side: a
    // name and the same name in another case are one name to this.
    const CASED = NAME.chain(
        (name) => fc.tuple(fc.constant(name), fc.constant(name.toUpperCase()))
    );

    fc.assert(fc.property(CASED, NAME, ([lower, upper], other) => {
        assert.equal(naturalCompare(lower, upper), 0, JSON.stringify(lower));
        assert.equal(
            sign(naturalCompare(lower, other)),
            sign(naturalCompare(upper, other)),
            `${JSON.stringify([lower, upper, other])}`
        );
    }), RUNS);
});

test("sorting does not depend on the order the names arrived in", () => {
    // What a contradiction actually costs: the same set of names, shuffled,
    // coming back in a different order.
    fc.assert(fc.property(fc.array(NAME, { maxLength: 8 }), (names) => {
        const sorted = [...names].sort(naturalCompare);
        const reversed = [...names].reverse().sort(naturalCompare);

        assert.deepEqual(reversed, sorted, JSON.stringify(names));
    }), RUNS);
});
