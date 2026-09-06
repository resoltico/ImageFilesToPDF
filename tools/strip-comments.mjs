import { commentsIn, assertSameProgram } from "./javascript.mjs";
import { exciseRanges } from "./excise.mjs";

/*
 * Comments removed from the released artifact.
 *
 * The artifact is pasted into the Shortcuts editor, where its size is the
 * user's problem and nobody reads its comments: the banner says where the
 * sources are, and that is where the explanations live. Removing them takes
 * about two fifths off the file.
 *
 * The parser decides what a comment is. A regex cannot: a double slash inside
 * a string, or a slash-star inside a character class, is not a comment, and a
 * stripper that takes one for a comment produces a file that still parses and
 * behaves differently -- on someone else's Mac, inside Shortcuts, where
 * nothing can be attached to it.
 *
 * What goes is removed by byte range, taking the line with it where the
 * comment had one to itself; excise.mjs says exactly how much.
 *
 * The ECMAScript version is passed in rather than imported, because the module
 * that declares it is the one that calls this.
 */

/*
 * Everything goes except the comment the file opens with and the comments the
 * build itself generated, which are named rather than recognised: `kept` holds
 * their exact text, so the side that writes them is the side that decides.
 *
 * The verification is a parameter so that it can be shown to happen. A guard
 * that is never reached in ordinary use is a guard nothing proves is there.
 */
export function stripComments(source, options, verify = assertSameProgram) {
    const { ecmaVersion, kept = new Set() } = options;
    const removed = commentsIn(source, ecmaVersion).filter(
        (comment) => comment.start > 0 && !kept.has(comment.text)
    );
    const stripped = exciseRanges(source, removed);

    verify(source, stripped, ecmaVersion);

    return stripped;
}
