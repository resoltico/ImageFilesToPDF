# QA contract

## Source gate

`npm run quality` must pass. It performs:

1. JavaScript syntax checks for all source, tool, test, and release files;
2. whitespace, line-ending, and literal-control-character checks;
3. structural rules on `src/`, including that no module names an executable
   outside `src/core/executables.js`;
4. `shellcheck` on the integration scripts and `actionlint` on the GitHub
   workflows, when they are installed;
5. built-in Node tests of every module in `src/` — the portable core and the
   macOS runtime layer alike — held to 100% line, branch, and function
   coverage, with test helpers excluded from the measurement;
6. checksum and source-to-distribution verification.

The gate deliberately does **not** build first. It verifies the committed
artifact against `src/`, so a stale `dist/` fails the gate instead of shipping.
Use `npm run release` to regenerate and then verify.

## Static analysis

ESLint 10.9.1 runs in strictest mode — `js.configs.all`, every core rule — as
part of `npm run quality`, and reports no findings.

Rules that are switched off are enumerated individually in
`eslint.config.mjs`, each with the reason it does not apply. Nothing is
relaxed in bulk, and the three rules that are reconfigured rather than
disabled (`no-magic-numbers`, `max-params`, `new-cap`) carry their rationale
alongside.

## Preflight

The external tools are checked before the user is asked anything, and every
problem is reported together. The checks are capability probes rather than
presence or version tests: each tool runs with the flags the pipeline uses
against a path that cannot exist, and the failure it gives back says whether
it understood them.

Covered by tests: a healthy machine, each tool missing individually and all at
once, a tool present but too old for `--mode=strict` or `--export-profile`, a
probe that cannot run at all, and a machine without Homebrew. The tests also
assert that no dialog is shown before the checks complete.

## What the artifact says about itself

The artifact leaves this repository: it is pasted into a Shortcuts action and
travels with whoever exports that. Its header is therefore the only place it
can state what it is, whose it is, and where it came from — and the build is
attested on GitHub, which is not checkable by someone holding a file that does
not name its repository.

Nothing in the header is typed twice. The version and URL come from
`package.json`, the copyright line from `LICENSE`, and the macOS floor from
`tools/release.mjs`. The URL is stated in four places — both npm forms, the
README and INSTALL.txt — and the gate refuses them if they disagree, because a
stale address in the file a user follows is worse than no address.

Verified to fail: a README naming a different repository, and a `LICENSE` that
no longer carries a copyright line to quote.

## Comments in the artifact

Comments are removed on build, which takes the artifact from about 90 KB to
about 57 KB. What a user pastes into Shortcuts has an unknown ceiling, and the
explanations live in the sources the header points at.

The parser decides what a comment is. A regex cannot: a double slash inside a
string, or a slash-star inside a character class, is not a comment, and a
stripper that takes one for a comment produces a file that still parses and
behaves differently — on someone else's Mac, inside Shortcuts, where nothing
can be attached to it.

The same reasoning applies to the assembly itself. A module's `require` lines,
its `module.exports` and its strict directive are found in the syntax tree,
not by matching lines, so what the build recognises does not depend on how the
sources happen to be formatted — an indented require, an export that is not
the last thing in the file, two spaces after `function`. Only the destructured
form of a require is removed: the bundle shares one scope, so
`const { a } = require("./b.js")` needs no binding at all, while
`const b = require("./b.js")` would bind to an exports object that does not
exist once the modules are concatenated. Anything else mentioning `require` or
`module.exports` is left where it is and refused by name.

Every acorn call lives in `tools/javascript.mjs`, the CommonJS shapes in
`tools/commonjs.mjs`, and the removal itself in `tools/excise.mjs`, which both
the comment strip and the bundler use. The ECMAScript version is passed in from
the floor rather than copied beside it.

What goes is removed by byte range, so every surviving byte is exactly what the
bundler emitted. A minifier reprints from a syntax tree instead, renormalising
quotes and parentheses; the executables check greps the artifact for its
binaries by their quoted form, so that is not a free change.

A removed comment takes the whitespace in front of it, and, when it had the
line to itself, the rest of that line. Nothing reads a line it does not already
own: the whitespace around a comment is outside every literal by construction,
whereas collapsing runs of blank lines afterwards reads every line in the file
— including the ones inside a multi-line template literal, where a blank line
is a character of somebody's output. Blank lines the sources wrote survive
exactly as written, which is why a comment's former position shows as one.

The comments that survive are **named, not recognised**. The build hands the
strip step the exact text of the comments it generated, so the side that writes
them is the side that decides what is kept — a shape has to be described twice
and can be changed on one side alone. The marker itself is declared once, in
`tools/bundle.mjs`, and both the render and the keep-set are derived from it.

The build then asserts that the stripped text has the same token sequence as
the text it came from. Two texts with the same tokens differ only in what the
parser discards, so this is program equivalence rather than a spot check, and
it runs during the build: a stripped artifact that is not the same program
cannot reach the disk.

`check-dist` is unaffected. It proves the artifact is exactly what the build
produces from `src/`, and stripping is part of that build.

A repository-level test asserts the whole property against the real render:
every comment in the built artifact is the banner or exactly one marker per
bundled module, in bundle order, and nothing a source file wrote. It is
independent of the marker's format, so changing that format on one side alone
fails rather than silently shipping an artifact with no markers.

Verified to fail: a stripper that drops a token, adds one, or changes one; a
comment opener inside a string, a character class or a template literal; a
comment that only resembles a section marker; a marker format changed on the
producing side alone; the keep-set stopping being honoured; a comment's leading
or trailing gap being left behind; code following a block comment with no space
between them; and the verification itself not being reached.

## The action's external surface

Every binary the action runs is named in `src/core/executables.js` and nowhere
else, and a source rule refuses an absolute executable path anywhere else in
`src/`. Adding a binary is a visible edit to that list, and the surface is a
file to read rather than a fact to reassemble.

The rule is enforced on `src/` rather than on the artifact: `check-dist`
proves the artifact is a byte-for-byte render of the source, so no property
can hold of one and not the other, and the source is where a violation is
written.

Verified to fail: a `/bin/cp` or `/opt/homebrew/bin/ghostscript` literal in a
production module.

## Walking a selected folder

A directory listing has to come back as a list. A filename may contain a
newline, and no text separator survives that — so the walk asks Foundation
rather than the shell. Measured: `contentsOfDirectoryAtPath` returns
`"two\nlines.png"` intact, `attributesOfItemAtPath` reports a symbolic link
without following it, and `NSWorkspace` tells a package from a folder.

It is also the only way to ask about thousands of entries without paying for a
subprocess each time: a folder of three thousand photographs would be three
thousand invocations of `/bin/test`.

The bridge is a parameter, so the walk runs against a fake tree in Node, and
`tree.js` returns null when there is none — the action still converts the
files it was given, and a selected folder is refused with a reason.

What was selected is settled before anything is admitted, because two names
for one thing were two things: every path is standardized and asked what it is
through the same tree that will do the walking.

Two names for one thing is also what a Mac's own filesystem hands over. It is
case-insensitive as formatted, so `/photos/A.jpg` and `/photos/a.jpg` are one
photograph -- measured: the same `NSFileSystemNumber` and the same
`NSFileSystemFileNumber` -- and standardizing the spelling does not make them
one selection. So a selection is keyed by what the filesystem says the file
is, and the ledger of what has been taken holds the same thing. Both come out
of the attributes the walk already reads, so knowing costs nothing. A path is
the fallback where there is no file to identify, which is where there is
nothing to convert either. Asking the shell instead is
what sent the walk inside an `.app`, which is a directory to `/bin/test`;
deciding as each item came up is what made the answer depend on the order
Finder handed the selection over.

Nothing is dropped for where its name sits. A selected folder covering a path
is not the same as the walk taking it — the walk passes over hidden entries,
packages and links, and says nothing about files that are not images — so
dropping an explicit request on that assumption removed it from the run
entirely: a photograph whose name began with a dot did not appear in the PDF
and did not appear in the report, and a file that could not be converted
stopped saying so. What was taken is settled by the walk itself, through one
ledger of paths.

The order is what makes that work. Folders are walked first and in path order,
which puts an ancestor before anything inside it — a folder's path is a proper
prefix of every path beneath it, and a prefix sorts first — so the images in
an overlap belong to the outermost folder that was selected. Every explicit
request is then considered against the finished ledger: already in it means it
was converted, which is neither a rejection nor a second copy.

Two things the walk cannot pass over silently are the folders it could not
read and the entries it could not get the attributes of. Both might have been
photographs. A listing can succeed while inspecting what it listed fails, so
these are separate failures, and each comes back with the images and becomes a
rejection naming the path — a folder whose photographs were all in a subfolder
nobody had permission to open used to produce a PDF of whatever else was lying
around and report that nothing had failed.

Verified to fail: a link with an image's name being taken; a package being
walked into, whether reached through a folder or selected directly; a hidden
entry being taken; a folder that cannot be read passing as empty; a subfolder
that cannot be read being passed over; an entry whose attributes cannot be
read being passed over; a folder holding no images reporting nothing; a folder
whose images another selection already took being reported as holding none;
the same file being taken twice when a folder and something inside it are both
selected, in either order; an explicitly selected hidden image, hidden folder
or unconvertible file disappearing because its folder was selected too.

## Saving the finished PDF

Publication is one transaction, because a PDF that is half published is worse
than one that is not published at all: the user is left with a file that
carries the name of their document and is not it.

One rule covers it, and it is about ownership rather than about inspection:
**this run removes only what this run made, and the finished PDF stays in the
workspace until the output path has been checked.**

The output name is claimed, never written into. `/bin/ln` creates the
directory entry in one step and fails if anything is already there --
measured, including that what is there is left exactly as it was, and that a
link whose target is gone still counts as there. Nothing else can produce a
name atomically, so nothing else is used to produce this one.

The claim is made from the workspace file itself whenever it can be, which is
whenever the two are on one volume: the ordinary case, where the whole
publication is one operation and no file of ours ever appears in the output
folder under any other name. A hard link is not a second copy and is
indistinguishable from one afterwards -- measured: same mode, same owner, same
extended attributes, and it outlives the workspace it was made from.

Renaming straight to the final name is what this replaced, and it is atomic
only when both ends are on one volume. Across volumes Apple's `mv` copies to
the pathname it is given: measured on an attached test volume, an interrupted
move left 3,211,264 bytes of a 1,258,291,200-byte file under exactly the name
the finished document was to have.

When the link cannot be made -- another volume, a filesystem without hard
links, or a host that refuses -- the PDF is copied into the output folder
under a hidden name and claimed from there. Which of those it was is decided
by asking whether the output name is taken, not by reading the refusal: taken
means publication stops, and free means the refusal was about the link. Only
then, and only for a name just found free, does a rename stand in, because
otherwise publishing to a FAT-formatted drive or some network shares would be
impossible. That leaves `mv`'s own check-then-rename window on those volumes,
which is stated rather than closed: there is no exclusive-create rename to
reach from a shell.

"Is the name taken" is one question with one answer: `test -e X -o -L X`. `-e`
follows a symbolic link and reports on its target, so a link whose target is
gone reads as nothing at all -- measured, and `mv` replaces such a link
without complaint while `ln` refuses it. The same question decides the output
filename, so a name occupied that way is stepped around rather than collided
with.

The staging copy is this run's own or it is not used. The name is checked
before anything is written to it and a name that is taken stops publication
rather than being borrowed: a file that happened to be under it, of the same
size, was otherwise adopted and its unrelated bytes published. What remains is
a race against a deliberate writer in the user's own folder, which the nonce
in the name makes an adversarial act rather than an accident.

What is at the output path is then checked as a regular file with something in
it, and only then is anything let go. `test -s` alone passes for a directory --
measured, and it is how a PDF that `mv` had pushed inside a folder standing at
the output path was reported as published. `ln` puts the file inside such a
folder too rather than refusing it, so the check after the claim is what
catches that, and the link it left behind is this run's own to remove.

Recovery does not search. The finished PDF is in the workspace by
construction, so it is set aside from there. It used to be worked out by
asking whether files existed, through a check that answers "no" when it cannot
tell -- so a refused check deleted the only copy and then reported the PDF
missing.

Verified to fail: a transfer that stops part way leaving an incomplete file at
the final name; a copy whose size does not match the source being reported as
published; a name another run took being overwritten, whether it is taken
before the claim or while the copy is being made; a link whose target is gone
being replaced; a staging name this run did not create being adopted or
removed; a PDF pushed inside a folder being reported as published; a
recovery that deletes or disowns the finished PDF because a check could not
answer.

## How many pages one command can carry

Every page path goes on one command line, and a command line has a size.
Measured on macOS: `ARG_MAX` is 1 MiB, and a combined PDF of 8,000 pages was
accepted while 12,000 failed — with "An error occurred.", which is nothing a
person can act on.

pdfcpu appends to a PDF that already exists, in the order it is given the
pages, so there is no ceiling left: measured, two imports of two pages produce
four pages in the order imported, and 3,000 pages in four groups produce a PDF
of 3,000 pages that passes strict validation.

The budget is a fraction of the measured limit, because `execve` counts the
environment against the same allowance and this code cannot see how large the
environment is. It is spent on the arguments as they will actually be written,
quoted and separated, so a batch adapts to how long the paths turn out to be.

Chunking introduces a failure a single import did not have — a batch that
appends nothing while exiting zero — so when the pages went over in more than
one group, the PDF is asked how many pages it ended up with.

## What a filename may be

A path component is 255 bytes on the filesystems macOS puts a Mac's files on:
HFS Plus documents 255 characters and APFS 255 UTF-8 characters, so bytes is
the bound that satisfies both. Nothing truncates a name that goes over it --
the write fails with a complaint about the length -- and the output name is
longer than the name it came from, so a valid source name could produce one:
measured, a 244-character stem produced a 264-character output name.

The stem is cut to fit, in bytes, between characters rather than between
bytes, and the room reserved is measured rather than assumed: a headless
caller supplies its own timestamp, and the collision suffix has to fit too, or
a name fits until the second run of the day. What the cut can leave behind --
a trailing dot or underscore -- goes back through the same sanitizing that
exists to remove it.

This is a bound on one component, not on a path. `PATH_MAX` is 1024, and a
folder path already near it plus any legal name will exceed it; that is stated
rather than guarded, because the folder is the user's and truncating their
path is not this action's to do.

Where the extension ends is read off the end of the name rather than matched
across the whole path. A pattern could not reach it past a newline -- `.` does
not match one -- so a folder with a newline in its name, which this action
handles everywhere else and the integration suite exercises deliberately,
could not have a second PDF numbered inside it. Two files of one stem, such as
`photo.jpg` and `photo.png`, need that numbering within a single run.

## What must not be ignored

`dist/` holds the released artifact and is committed deliberately. If it were
ever added to `.gitignore`, the committed artifact would quietly stop updating
while every local check kept passing — `check-dist` compares the working tree
against `src/`, not against git — and the next release would publish whatever
was committed last. The gate refuses it, however it is spelled, and a later
negation is honoured the way git honours one.

The other half is the ordinary one: everything the toolchain writes into the
working tree must be covered — `node_modules/`, `reports/` and
`.stryker-tmp/`. An ignore entry for a directory nothing creates is not merely
dead: in the discovery walk, source inside it would leave the gate silently.

Verified to fail: `dist`, `dist/` or `/dist` in the ignore file, and any of
the generated directories missing from it.

## The documents

The prose was the one part of this repository nothing read, and `npm run lint`
found `CONTRIBUTING.md` carrying its own opening spliced into the middle of a
sentence. A script had put it there: in a JavaScript replacement string a
dollar followed by a backtick means "everything before the match", so writing a
backtick-dollar-backtick into a file through `String.replace` inserts the
file's own prefix. Nobody noticed, because prose is read in pieces.

Only what a machine can be sure of is checked. Every Markdown document must
have exactly one top-level heading and open with it, and no section may repeat
in the same place — which is the shape that kind of damage takes. A heading is
compared with the headings it sits under, not on its own: a Keep a Changelog
file repeats "### Fixed" under every release that fixed something, and a rule
that refused the second release is a rule somebody weakens under pressure.

The documents are found by the same walk that finds the source, which skips
what the toolchain generates — `.stryker-tmp` holds a copy of this whole
repository, and a walk that descended into it would check the sandbox's files
as though they were the repository's own. INSTALL.txt and LICENSE are held to
the hygiene rules too: the first ships in the release and the second is quoted
into the artifact's header, so a splice into either would be as invisible as
the one that started this. A repository with no documents fails rather than
passing vacuously, and two broken documents always report the same one first.

A path a document names in backticks must exist. These documents name modules
constantly — which rule lives where, which module owns the executables, where
the bundler is — and this repository moves modules; a reference that no longer
resolves sends a reader to something that is not there while the prose still
reads perfectly. A fraction is not a path, and an ellipsis means the prose is
describing a shape rather than naming a file.

Verified to fail: the actual damage, reproduced; a second title; a section
before the title; a section repeated under the same parent; a Markdown file
with no headings at all; trailing whitespace, a carriage return, a missing
final newline; and a reference to a file that is not there. Verified to pass:
prose that mentions a hash, the same subheading under two different releases,
and a plain-text document that underlines its headings instead.

What is not checked is whether the prose is true. That is read, and this round
of reading found the artifact documented as passing a vips flag it no longer
passes, a macOS version that was never right, and a dependency list missing an
entry.

## Workflows

The workflows are the one part of this project that has never executed, so a
mistake in them would surface on a first push rather than in the gate.
`actionlint` checks their schema, expression syntax, runner labels and the
shell inside `run:` steps. It is optional in the same way `shellcheck` is: the
gate stays runnable without it, and CI installs it.

Verified to fail: a runner label typo (`ubuntu-latests`) is rejected.

Nothing interpolates `${{ }}` into a `run:` block. Values that come from the
event — the tag above all — reach the shell through `env:` and are read as
shell variables, so a name chosen by whoever pushed cannot become part of the
script.

Every `uses:` must also be pinned to a full commit SHA. A tag is a moveable
label — whoever owns an action repository can point `v4` at different code
tomorrow, and it would run with whatever permissions the job holds. Dependabot
keeps the pins current. Short SHAs are refused too: they are ambiguous and can
be made to collide.

Verified to fail: `actions/checkout@v4`, `@main`, a bare name, and a
seven-character SHA are each rejected; a local `./.github/actions/...` action
is exempt, because it moves with this repository.

## What a release proves

The tagged source is qualified on macOS — the full gate and the integration
suite — before anything is built. The artifact is then built again on a clean
runner and `git diff --exit-code` requires it to reproduce the committed bytes
exactly. That is what makes the attestation worth having: what is signed was
both built by CI and is identical to what was reviewed in the repository.

Every file the release offers is an attested subject: the artifact, the
checksum manifest and INSTALL.txt. Attesting only the manifest would cover what
the manifest lists and leave the manifest and the instructions uncovered, and
all three are things a person downloads and acts on.

That job installs nothing. It holds the write and signing permissions, so the
less code that runs there the better, and all it needs is the release notes out
of CHANGELOG.md. The property is checked rather than trusted: a test walks the
import graph of the entry points that job runs and refuses any package outside
Node's own. It was written down and unchecked once, a refactor gave the builder
a parser, the notes reached the builder through four modules, and the release
failed at its last step for a dependency none of it uses.

The attestation is then verified in the same job, before the release is
created. An attestation that does not verify is worth less than none, because
it is the thing a user is told to check — and failing here publishes nothing.
The tag is also re-resolved at that point, because a tag can be moved after it
is pushed.

## Language target

The artifact must run on the oldest supported macOS, so the gate pins it to
ES2022 (JavaScriptCore on macOS 12.3, which is Safari 15.4) and checks it
twice:

- ESLint `ecmaVersion: 2022` on `src/` rejects newer **syntax**;
- `tools/lint/language-target.mjs` rejects newer **features** against the
  rendered artifact.

The second check is not redundant, for two reasons. A newer built-in parses
cleanly at any `ecmaVersion`, so ESLint alone passes it and it fails on a
user's Mac instead. And no ECMAScript year maps exactly onto a Safari release:
ES2022 static initialisation blocks are accepted by `ecmaVersion: 2022` but did
not reach JavaScriptCore until Safari 16.4, so the denylist carries them.

Both halves are verified to fail when the constraint is broken.

The floor is declared once, in `tools/release.mjs`, and flows from there into
the artifact banner and the gate's output.

## What the progress reporting does not establish

The action writes what it is doing to JavaScript for Automation's own
`Progress` object. **Whether a Shortcut displays any of it is unmeasured.**

It was chosen on the strength of what happens when it is wrong. An assignment
to `Progress` cannot open a window, cannot raise the process activation policy
and put a Dock icon up in the middle of an action, and cannot pump a run loop
underneath a host that is driving the script. If nothing is listening, nothing
happens. An `NSPanel` can do all three, and this repository cannot measure
whether it does: a Shortcut cannot be created from the command line, so the
probe that established the settings form presents cleanly cannot be repeated
without someone running it by hand.

To find out: paste a script that sets `Progress.totalUnitCount`,
`completedUnitCount` and `description` into a Run JavaScript action, run the
Shortcut, and watch. The object exists and accepts those assignments under
`osascript` — that much is measured. The sink is a parameter, so if the answer
is no, a panel can replace it without touching a single call site.

## Coverage

The figure covers every production module — the list in
`tools/module-order.mjs`, which is what the gate walks, and a file missing
from it fails discovery. Node's coverage reports only the
files a test loads, so a module with no test is not reported as 0% — it is
absent, and the total looks perfect while ignoring it. The thresholds are
meaningless unless every module is loaded by something.

The runtime modules take `app` as a parameter, so they are exercised from Node
with a fake host that models the handful of commands the runtime actually uses
(the binaries in `src/core/executables.js`, plus vips and pdfcpu) over an
in-memory filesystem.

## What the AppKit tests do not establish

The settings form is drawn with AppKit, and no headless test can prove that
AppKit put anything on screen. This is stated rather than papered over,
because the coverage and mutation figures below would otherwise imply more
than they do.

What is tested, against a fake ObjC namespace: that each row becomes the right
control, that the rows are laid out top to bottom rather than upside down in
AppKit's bottom-left coordinate space, that the colour options carry swatches
and the others do not, that current answers are preselected, that edited
values are read back, that nothing is scheduled against the form, and that
each of the three outcomes — answered, cancelled, never presented — is handled
distinctly.

There was a watchdog: an `abortModal` scheduled two minutes out, so a form
that never returned could not hang the run. It fired on forms that were
working perfectly — taking two minutes to choose a paper size and a colour is
not evidence of anything — and the abort reads as "never presented", so the
user was dropped into the stepwise dialogs half way through answering. Nothing
replaced it: the form ends when it is answered or cancelled.

What is not tested, and cannot be: that AppKit renders it. That was
established by running a probe inside `ShortcutsMacHelper`, which presented a
real `NSAlert` with an accessory view and had it answered, without raising the
process activation policy. The probe is evidence about one macOS on one
machine, which is why `settings-form.js` keeps the stepwise dialogs as a live
fallback and treats a form that cannot be presented as unavailable rather than
as a cancellation.

## Mutation testing

`npm run test:mutation` (StrykerJS) mutates `src/`, `tools/lint/` and
`tools/bundle.mjs`. Per-test coverage analysis means each mutant is exercised
only by the tests that reach it. A surviving mutant is a bug the tests would
not catch, which coverage cannot reveal.

The tests are split accordingly:

- `tests/unit/` — everything the code under test receives by parameter, so it
  is meaningful against a mutated copy. This is what the mutation run executes.
- `tests/repo/` — assertions about the actual repository: that the artifact
  names no executable the source does not, that it is within the language
  target, that no file escapes discovery, and that the declared version and
  Node pin agree. These read the real tree, so they are excluded from the
  mutation run, where the tree is deliberately altered.

Both run in `npm test` and both count towards coverage.

Anything listed in Stryker's `mutate` must have a test in `tests/unit/`.
Mutating code whose only tests are excluded produces mutants that cannot be
killed by construction, which quietly depresses the score and hides the real
weaknesses.

The break threshold is 96, set below the measured score so ordinary changes
cannot fail CI on noise while a genuine drop still does. The score itself
moves by a tenth or two between runs, because a mutant that times out counts
as killed and the timeout is a wall clock; the run reports the current figure
and `stryker.config.json` records what it was when the threshold was last
raised.

Nothing under `mutate` reports `NoCoverage`. A module that reaches the
filesystem or another process takes that world by parameter — the tool probes,
the file readers, the artifact render — so what a wrapper asks for can be
asserted against a fixture instead of being observed passing on a machine that
happens to have the tool.

### Survivors

The mutants that remain alive are equivalent: they describe a program that
cannot behave differently from this one. They fall into six groups.

- A description passed to a command whose failure is deliberately swallowed —
  `removeFile`, `setAside`, the environment probe. The message is
  constructed and discarded, so its text cannot be observed.
- A defensive conversion that the surrounding code already tolerates:
  `String(x).trim()` before `parseInt`, which skips whitespace itself.
- A guard that duplicates one further along, so removing it leaves the same
  answer — `index >= 0` before a `slice` that already returns the whole
  string for `-1`, or `items.length > 0` before comparing `items[0]` to a
  flag it can never equal.
- An anchor or quantifier that only matters for input the shape of the data
  cannot produce: a `"use strict"` that is not the first line, two spaces
  after `function`, or `git+` somewhere other than the front of a repository
  URL — GitHub names cannot contain a plus, so npm's prefix is the only one
  there will ever be.
- A body that is already a no-op. The silent progress sink's three methods
  exist to be called and do nothing, so emptying them changes nothing; the
  same goes for a `catch` that returns `false` to a caller that only asks
  whether the answer is truthy.
- A field nothing downstream reads: the empty output path returned alongside a
  failure, where the caller takes one or the other and never both. Settled by
  running the caller with the mutated field in place.

They are settled by running each mutant against the real function over a
spread of inputs and looking for a disagreement, not by argument. The ordering
comparator's six were decided over every pair of strings up to three
characters from a nine-symbol alphabet: five agree on all 672,400 pairs, and
the sixth did not — splitting a name into single characters rather than runs
reorders `photo1.jpg` against `photo .jpg`, so that one is a test. The path
and invocation guards were decided the same way, and `describeSetupProblems`
and `createSeparatePdfs` were run with the mutated field in place to confirm
that nothing downstream reads it.

A campaign finds two kinds of thing, and only one of them is a defect. No run
so far has found behaviour this code gets wrong. What they find is correct
behaviour that nothing is holding in place — a repository whose name ends in
`.io` surviving npm's `.git` suffix being stripped, a value that merely
mentions a file URL not being read as one, a URL disagreement naming which
file each value came from, the file being prepared counted from one rather
than zero.

The last run also found a cost rather than a wrongness, which is the same
thing at a distance: the batching measures the fixed part of the import
command so it knows how much room is left for pages, and measuring it with
every page already in it leaves nothing of the budget. The PDF still comes out
right — every page, in order — but a job of four thousand pages becomes four
thousand invocations of pdfcpu. The test now says a command carries more than
one page.

The run after the five-defect audit found five more, and one piece of dead
code: that a rename which was refused has to say which of the two steps it
was; that a staging file this run did not create is neither adopted nor
removed; that the copy this run did make is cleared away when the claim after
it fails; that among two spellings of one file the name it is stored under is
the one used; and that the fake answering /bin/test had been answering a
question that was not asked -- it matched any five-word test, so a mutated
flag still got the right answer. The dead code was half of a guard: a claim is
made from the workspace file or from the staging copy, never from the output
name, so comparing it against the output name decided nothing.

The run before that found eight of the same kind: the
catch that turns an unmeasurable file into "unknown" rather than into nothing;
the two operations that can fail while taking the output name, which have to
say which one it was; that the staging file is the only copy the run has once
a rename has emptied the workspace, so removing it on a failure would destroy
the finished PDF; that the workspace copy goes after a copy-staging too; that
the leading zeros stripped from a number are the ones at the front and all of
them; that a run of letters is compared as a word rather than by its length;
that a text exactly filling its byte budget is kept whole; and that the host
is told how many units of work a run has. It also found one line of dead
code -- a ledger entry written after everything that reads it -- which is
gone.

The run before it found four of the same kind: the first character of each width in the UTF-8 table, where a comparison
one step out under-counts a byte; the description a finished page reports,
which is what somebody waiting reads; that a path handed over twice is
classified once, which is a cost in Foundation calls rather than a wrong
answer; and that the second of publication's two renames names itself when it
fails, so a message about the copy cannot be mistaken for one about the
rename. Each is now a test.

### Runner

The tap runner executes each test file directly (`node <file>` with the TAP
reporter), which keeps the tests in the same process as Stryker's coverage
hook and so allows `coverageAnalysis: "perTest"`. Running them through
`node --test` instead forks a child per file, the hook records nothing, and
every mutant reports `NoCoverage`. The reason is recorded in
`stryker.config.json` as well, where the setting is.

Per-test analysis brings a full run to about half a minute, which is why
mutation testing is part of `npm run quality` rather than a separate job.
Incremental mode is off: at that speed it buys nothing and a stale incremental
report is a real hazard.

It carries a break threshold, so a drop in test strength fails the build rather
than passing quietly.

## Testing the gate itself

The gate's own modules are tested, and each guard is asserted to *reject* what
it exists to reject — not merely to be present. A guard that stops rejecting
still reports success, so being present is not evidence of anything.

The rejection message is asserted whole rather than sampled. Half a message
still matches a substring, and the half that goes missing is the half that
says what to do about it.

What the gate runs is asserted too, against an injected runner: the
availability probes ask `shellcheck --version` and `actionlint --version`,
the syntax check runs the executing Node with `--check` and inherited output
so a parse error is printed rather than swallowed, and every file the gate
reads it reads as UTF-8 text. A probe that ran something else would answer a
different question, and the gate would skip or attempt a tool on the strength
of it.

`tools/lint/language-target.mjs` additionally refuses to run at all with an
empty rule list, for the same reason.

## Structure

No file may exceed 150 lines, enforced by the gate. A file that outgrows the
limit is split; the limit is not raised. Every core module has a matching test
file under `tests/unit/`.

## macOS integration gate

`npm run test:integration:macos` requires macOS, `vips`, `pdfcpu`, qpdf, libtiff,
Poppler, and `osascript`. It runs three suites: `tests/integration/macos.sh`,
`tests/integration/selection.sh` and `tests/integration/publication.sh`.

The first exercises:

- actual JXA execution through `osascript`, both with and without the `--`
  argument separator that `osascript` forwards into `run()`;
- JPG, RGB PNG, and alpha PNG;
- shell-sensitive filenames;
- natural page order;
- combined and separate output;
- exact A4 portrait and Letter landscape page sizes, asserted against the size
  Poppler reports;
- white and `#8E79E0` backgrounds;
- ICC colour management, using a Display P3 source that reproduces incorrectly
  if the embedded profile is ignored;
- no upscaling of images smaller than the page;
- strict pdfcpu validation of the **published** file — the pipeline validates
  the staged one, so this is the only check that publication preserved it;
- qpdf structural checking, as a second and independent implementation:
  pdfcpu wrote the file, so pdfcpu calling it well formed says nothing about
  pdfcpu. Poppler cannot stand in — given a wrong stream length, a truncated
  trailer or a bad xref entry it accepts and repairs all three, which is also
  why the pixel assertions below say nothing about structure;
- page counts;
- no-clobber suffixing;
- source images left unmodified.

Pixel assertions compare against expected values with an explicit tolerance
rather than matching formatted strings, so a check cannot silently stop
discriminating.

The second exercises what the action decides to convert, which turns on what
macOS itself answers and so cannot be settled by a fake:

- a selected folder walked through Foundation, with a subfolder `chmod 000`
  denies: the images elsewhere are converted, and the receipt names the folder
  that could not be read;
- a folder and a photograph inside it, in both orders, converting each
  photograph exactly once and refusing nothing;
- a directory named `Photos.app`, which `/bin/test -d` calls a directory and
  `NSWorkspace` calls a package: refused, with nothing written inside it;
- a photograph selected by hand alongside its folder, where the walk would
  pass over it: a hidden image must still reach the PDF;
- one photograph selected under two spellings, `A.png` and `a.png`, on the
  case-insensitive filesystem a Mac comes formatted with: one page, and
  nothing refused.

The third takes the finished PDF from the workspace to the output folder:

- on one volume, where the whole publication is a rename, a claim and a
  cleanup: the PDF validates, the folder holds no staging file, and the
  published PDF has one name rather than two;
- across volumes, on a disk image attached for the test, which is where `mv`
  copies rather than renames — the case no fake can reach. Skipped, loudly,
  where a test volume cannot be attached, because that is the machine's
  decision rather than the code's;
- a link whose target is gone, standing at the name the PDF was going to
  have: the link must survive and the PDF must be numbered past it, because
  `-e` calls such a link absent and a rename replaces it;
- an output folder `chmod 555` denies, where every way of getting the PDF in
  there fails: the message must name a recovery path that exists and holds a
  PDF that passes strict validation, and nothing may be left at the output
  path — neither a partial nor the staging file.

One half of the unexaminable-entry case is unit-level only: producing a
directory that lists but will not let its entries be inspected takes either a
race or a protected volume, and `chmod` alone denies the listing too.

## Regression coverage

Each of these shipped once and is now guarded by a test that has been confirmed
to fail when the fix is reverted:

| Defect | Caught by |
| --- | --- |
| `--headless` not recognised through `osascript`'s `--` separator | unit + integration |
| `pdfcpu validate -mode strict` rejected by pflag | unit + integration |
| `colourspace srgb` ignoring embedded ICC profiles | unit + integration |
| `--size=both` upscaling small images | unit + integration |
| Stale `dist/` passing the gate | gate ordering |
| A module growing back into a god file | 150-line gate limit |
| Two modules declaring the same top-level name | bundler duplicate check |
| A built-in newer than the macOS floor | language-target check |
| Syntax newer than the macOS floor | ESLint `ecmaVersion` |
| A module escaping the gate's file discovery | recursive discovery + root config |
| A shell script growing into a god file | 150-line limit on `.sh` too |
| The version or Node pin drifting between files | consistency check |
| A bundler bug reaching the artifact | `tools/bundle.mjs` unit tests |
| A guard that stops rejecting | gate-module tests + empty-rule-list check |
| An executable reaching the artifact from outside one module | source rule |
| An image measured on its side, and placed at a quarter of its area | orientation unit tests + integration |
| An image written without metadata refused for having no orientation | absent-field unit test + the stripped JPEG in the integration fixtures |
| A validated PDF deleted with the workspace it was built in | job ownership tests |
| A file named for cancelling silencing its own failure | typed cancellation |
| A tool that printed nothing passing as usable | positive capability probe |
| An input that vanished between resolution and admission | accounting tests |
| A combined PDF too large for one command line | batching + page-count check |
| A folder reported as an unsupported image format | admission tests |
| A folder tree ordered by name, interleaving its folders | ordering tests |
| A subfolder that could not be read being passed over in silence | expand + admission tests + integration |
| A folder and a file inside it converting that file twice | selection identity tests + integration |
| A package selected directly being walked into | selection identity tests + integration |
| A half-written copy left wearing the finished PDF's name | publication transaction tests |
| A PDF pushed inside a folder being reported as published | regular-file check + publication tests |
| A recovery message naming a file that is not there | publication whereabouts tests + integration |
| An explicit selection disappearing because its folder was selected too | explicit-request tests + integration |
| An entry whose attributes could not be read being passed over | walk problem tests |
| A partial PDF under the document's own name, across volumes | claim-not-write protocol + cross-volume integration |
| Two runs both publishing to one name | exclusive claim tests |
| A completed count passing the total it was given | progress unit tests |
| A valid source name producing an output name the filesystem refuses | filename budget tests |
| Two long numeric filenames sorting as equal | comparator tests |
| A finished PDF deleted because a check could not answer | ownership tests |
| A staging file this run did not create being adopted or removed | ownership tests |
| A refused claim turning into an operation that replaces | claim tests |
| A link whose target is gone being replaced | entry test + integration |
| One photograph converted twice because a Mac is case-insensitive | identity tests + integration |
| A newline in a folder name stopping the output numbering | naming tests + integration |
| Tests that stop catching bugs | mutation testing with a break threshold |

## Acceptance boundary

The generated artifact still requires one successful Finder invocation on the
target account, because automation permissions and native dialog presentation
are account-specific.
