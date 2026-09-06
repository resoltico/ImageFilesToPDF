/*
 * Text removed from a file by byte range.
 *
 * Every surviving byte is exactly what was there before. Reprinting from a
 * syntax tree, as a minifier does, would not give that: it renormalises quotes
 * and parentheses, and this repository greps the artifact for its executables
 * by their quoted form.
 *
 * A range takes the whitespace in front of it, and, when nothing else shares
 * its line, the rest of that line. Left behind, the first is trailing
 * whitespace -- which this repository refuses everywhere else -- and the second
 * is a blank line where something used to be.
 *
 * Nothing here reads a line it does not already own. Collapsing runs of blank
 * lines afterwards would read every line in the file, including the ones inside
 * a multi-line template literal, where a blank line is a character of
 * somebody's output; the whitespace immediately around a comment or a statement
 * is outside every literal by construction.
 */

function withLeadingSpace(source, start) {
    let at = start;

    while (at > 0 && (source[at - 1] === " " || source[at - 1] === "\t")) {
        at -= 1;
    }

    return at;
}

function withTrailingSpace(source, end) {
    let at = end;

    while (source[at] === " " || source[at] === "\t") {
        at += 1;
    }

    return at;
}

function wholeLine(source, start, end) {
    const from = withLeadingSpace(source, start);

    // Something else is on this line, so only the range and the gap in front
    // of it go.
    if (source[from - 1] !== "\n") {
        return { start: from, end };
    }

    const to = withTrailingSpace(source, end);

    // Code can follow with no space between them, and then the line is not the
    // range's to take.
    return { start: from, end: source[to] === "\n" ? to + 1 : to };
}

/*
 * Ranges must be in ascending order and must not overlap, which is how both
 * callers get them: a parser reports what it finds as it scans.
 */
export function exciseRanges(source, ranges) {
    let text = "";
    let cursor = 0;

    for (const range of ranges) {
        const { start, end } = wholeLine(source, range.start, range.end);

        text += source.slice(cursor, start);
        cursor = end;
    }

    return text + source.slice(cursor);
}
