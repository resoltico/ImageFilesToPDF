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
one selection. So the ledger of what has been taken holds what the filesystem says each file
is, out of the attributes the walk already reads, and a path is the fallback
where there is no file to identify -- which is where there is nothing to
convert either.

The ledger settles what is converted, not what is asked. Keyed by identity,
the requests themselves were deduplicated before anything had asked whether
they were convertible: two hard links to one photograph, one named `.jpg` and
one `.backup`, meant the `.backup` was turned away and the `.jpg` vanished
from the run without being converted or reported. Every request is answered on
its own terms first -- what it is, and whether this action takes it -- and
only then against the ledger, so the answer does not depend on which name
arrived first.

A link gets the same answer from admission that it gets from the walk. It is
passed over there because following one is how a run leaves the folder it was
given; it used to be validated here through the shell, which follows it, so a
link and the file it points to were two images of one photograph. Asking the shell instead is
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
**every name this run writes to is one it took first, it removes only names it
recorded taking, and the finished PDF stays in the workspace until the output
path has been checked.**

Taking a name is the whole of the no-overwrite promise, and which operation
takes it depends on what the destination can do. Measured, on volumes
attached for the purpose:

| | hard link | `renamex_np` with `RENAME_EXCL` | `mkdir` |
| --- | --- | --- | --- |
| APFS, HFS Plus | yes | yes | yes |
| FAT32 | no | yes | yes |
| exFAT | no | no | yes |

`ln` creates a directory entry and fails if anything is there. The exclusive
rename moves a file onto a name and fails rather than replace what is at it --
one operation, so there is no moment in which the name exists and the PDF is
not in it. `mkdir` creates the place a publication needs when it cannot link,
and fails for anything already at that name.

It is reached through the C library, and the header is the whole of it:
`renamex_np` is declared in `stdio`, and a bridge that imports anything else
leaves it undefined -- which is how it was missed the first time it was looked
for, and why a fallback was carried for a year of releases that did not need
one. errno does not come back through the bridge, so a refusal is classified
the way a refused link is: by asking whether the name is taken.

Measured against a regular file, a link pointing at `/dev/null`, a directory
and a named pipe: `mkdir` refuses all four. The shell's noclobber redirection,
which used to take that name, refuses only two of them. It *accepts* a link
pointing at something that is not a regular file -- creating nothing, so the
run recorded a name it did not own and cleanup deleted the link -- and on a
named pipe it waits for a reader that never comes, with no timeout above it to
end the wait. mkdir never opens anything, so it cannot be made to wait.

Checking that a name looked free was worse still, and the difference is not
academic. It left whose file it was to be inferred from how the next command
turned out: a copy refused because another program had taken the name in
between was read as this run having made it, so cleanup deleted their file.
Nothing is inferred now. What a run may clear away is the place it made --
first what is inside it, then the place itself, with `rmdir`, which refuses a
directory that has anything else in it, so clearing away can never take
something with it.

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
links, or a host that refuses -- the PDF is copied into a place of this run's
own beside the destination and claimed from there. Which of those it was is
decided by asking whether the output name is taken, not by reading the
refusal: taken means publication stops, and free means the refusal was about
the link.

Both operations are tried from that place, the link first, because the copy is
now on the destination's own volume and a link is possible there even where
one from the workspace was not. Measured from beside the destination: APFS and
HFS Plus take the link, FAT32 refuses it with "Operation not supported" and
takes the rename, exFAT refuses both.

The link goes first for two reasons. It needs no bridge, and a volume that has
hard links must not be refused because a bridge is missing -- which is what
used to happen: the rename was the only thing tried from that place, so a
host without the `stdio` import could not publish to an attached APFS drive at
all, and was told the drive could not take the name. And a refused link says
something, where a refused rename says nothing at all.

Which operation may be used where is decided by what a failure would cost. `ln`
does not give up its source, so it can be used on the finished PDF itself. An
exclusive rename does give it up, so it is used only on the copy -- with the
original still in the workspace, which is the whole of what makes a copy
expendable. Claiming from the workspace is therefore offered no rename.

Where neither exists -- exFAT, measurably, where plain rename works and the
exclusive form is not implemented -- there is no operation that takes a name
and carries contents, and publication stops there. Nothing is written to the
destination, the message says the output name could not be created in one
step, and the finished PDF is kept and its location given.

That is a reversal, and the reasoning is worth keeping. Three releases took
the name empty and filled it, in one shell, and guarded the cleanup by
checking that what was at the name was still the file the shell had just
made. The guard cannot do what it appears to do: it proves the entry matches
something measured a moment earlier, which is not proof that it is the entry
this run created. A process can be stopped between those two calls for any
length of time, and POSIX offers no compare-and-delete to close the gap. The
same hole is in every design that creates the public name before it can
commit the contents, so no such design is used -- the name is not created
until it can be created whole.

What that costs is stated rather than traded away quietly: photographs on an
exFAT card cannot be converted into the folder they sit in. Any other
destination takes them, including every Mac-formatted disk and every FAT32
camera card, and the PDF is kept either way. What it buys is that no run of
this action can leave a nought-byte file, or another program's file, under
the name of somebody's document.

Network filesystems are unmeasured here. SMB and NFS answer for themselves
what they can do, and the code does not assume: it attempts the link, and
where that is refused it attempts the exclusive rename, and where that is
refused too it stops and quotes what it was told. A volume that supports
neither behaves like exFAT, which is the honest failure rather than a guess --
and one that supports hard links publishes by link, whether or not the
exclusive rename is implemented on it.

## Saying only what was established

A refusal is not a diagnosis. Two things are known when the output name could
not be created: whether the name is taken, which is an answer to a question
actually put, and what the system said about the operation it refused. Nothing
else is, because errno does not reach here and a refused link reports itself
only in a message.

Anything beyond those two is invention, and the invented one named the drive.
Measured, on the boot disk, with an ACL denying `add_file` and allowing
`add_subdirectory`: the place beside the destination was made and copied into,
both ways of creating the name were refused, and the message said "this drive
cannot take the output name in one step" while quoting the system saying
"Permission denied" two lines below it -- on a disk that does hard links and
exclusive renames both. The same sentence was shown when the bridge to the
rename had not loaded, which is a fact about the run rather than about any
drive.

So the plain words say what happened -- the name could not be created in one
step, and the PDF was not put there -- and the system's own words follow them.
That a run had no exclusive rename to try is said too, because that is
something it can establish about itself. The capability statement a person
needs on exFAT is still there, and it is the kernel's: "Operation not
supported". The fixture is `tests/integration/publication.sh`, which fails if
the message names a drive or a volume at all.

"Is the name taken" is one question with one answer: `test -e X -o -L X`. `-e`
follows a symbolic link and reports on its target, so a link whose target is
gone reads as nothing at all -- measured, and `mv` replaces such a link
without complaint while `ln` refuses it. The same question decides the output
filename, so a name occupied that way is stepped around rather than collided
with.

The staging copy goes into a place this run made, so it is this run's by
construction, and whatever is in that place afterwards -- a whole copy, half
of one, or nothing -- is this attempt's to clear away. `cp` is documented to
leave the destination in place after an error and can fail after writing part
of the file or all of it, which is why "did the copy report success" was never
the right question to ask about ownership.

What is at the output path is then checked for *which file it is*, and only
then is anything let go. The output path is asked for the volume and file
number it holds, and they must be the ones that were published: a hard link
shares them with the file it was made from and a rename carries them along --
measured -- so the same pair is proof, and nothing else is. A nonempty regular
file is not: another writer's PDF is one too, and taking it as ours published
their document, deleted both copies of ours, and reported success.

Which is what asking after the staging copy used to do. It asked whether that
copy was still there, to tell a rename that happened from one that had
declined -- and that question answers "gone" when it cannot be put at all, so
a refused inspection read as a publication. Nothing infers a result from a
file's absence any more; the identity at the output path settles it, and an
identity that could not be read matches nothing.

`ln` puts the file inside a folder standing at the output path rather than
refusing it, so that check catches it as well: the identity there is the
folder's, not ours. The link left inside is real, and it is removed only when
it is the file this run published -- a name that merely looks familiar is not
enough. An unrelated document with the same basename as the file the claim was
made from was otherwise deleted for it.

Recovery does not search. The finished PDF is in the workspace by
construction, so it is set aside from there. It used to be worked out by
asking whether files existed, through a check that answers "no" when it cannot
tell -- so a refused check deleted the only copy and then reported the PDF
missing.

Verified to fail: a place this run did not make being used or cleared away,
whatever kind of thing is at that name; a place something else has written
into being emptied; a transfer that stops part way leaving an incomplete file
at the final name; a copy whose size does not match the source being reported as
published; a name another run took being overwritten, whether it is taken
before the claim, while the copy is being made, or on a volume without hard
links; another writer's file at the output name being reported as ours; a
publication claimed without anything to prove it by; a link whose target is
gone being replaced; a name this run could not take being written to or
removed; a destination that can take a name by neither operation being
published to anyway, rather than told about; a cause being named that was not
established; a volume that can take a hard link being refused because the
bridge to the exclusive rename was missing; a document inside a folder that appeared at the output path being
removed for having a familiar name; a staging copy this run did make being
left behind after a failed copy; a PDF pushed inside a folder being reported
as published; a recovery that deletes or disowns the finished PDF because a
check could not answer.

## What a page background is

Any opaque sRGB colour, written as six hexadecimal digits. The four named
colours are presets — what the list offers — and not the list of colours the
program permits, which is what they used to be: a value was looked up in a
table of four and anything else refused.

Permissive at the edge and strict in what is kept. A leading `#` is optional,
either case is taken, surrounding space is ignored, and what is stored is
always uppercase `#RRGGBB`. Normalizing is idempotent, which is what lets the
form and the headless path share one parser without either needing to know
whether the other ran first.

Six digits and only six. Three-digit shorthand is refused rather than guessed
at, because `#FFF` is as readily an unfinished `#FFF000` as it is white; eight
digits are refused because the fourth pair is transparency, and a page
background has nothing behind it to be transparent against. A value that is
not text is refused rather than converted: a headless configuration is JSON,
where a bare number is a mistake to report, not a colour to infer.

One parser, in `src/core/colour.js`, and that is the point of it. There were
two before: the settings accepted `#RRGGBB` and nothing else, while the swatch
parser beside it also demanded upper case — so a value one accepted was one
the other quietly made nothing of. With arbitrary colours allowed, that
disagreement would have been a colour accepted and shown as no colour at all.

What vips is given is derived rather than tabulated, because a table cannot be
written out in advance for a colour the user typed a moment ago: one number
for a grey and three for a colour, which is exactly what the four entries
held. Measured: vips accepts a comma-separated and a space-separated vector
alike, and accepts a three-element background on a two-band image — a
greyscale photograph with an alpha channel — where it takes the first number.
The comma form is kept because it is what shipped and it raises no question
about an argument containing spaces.

A colour that is grey in two of its three channels is not grey. Sending one
number for `#C7C7E8` would spread 199 across every band and paint the page a
colour nobody asked for, while still looking like a colour — so the rule is
that all three must agree, and the tests say so with each pair in turn.

The background fills the page around an image and shows behind transparent
pixels. It recolours nothing opaque.

A two-band image — a greyscale photograph with an alpha channel — takes only
the first number of a background triple, which would deliver a colour as its
red alone. It never gets one: the resize stage converts to sRGB before
anything is flattened, and measured, `thumbnail --export-profile=srgb` turns a
two-band source into four bands. So the flatten sees RGBA and the colour
arrives whole.

That is asserted rather than reasoned about, because it was reasoned about
first and the reasoning is what a reader of `page-stages.js` cannot see: the
promotion happens a stage earlier than the flatten. `tests/integration/background.sh`
builds a genuine two-band source, refuses to run if it is not two bands, and
checks the margin, the transparency and the opaque half of a rendered page.
The suite's other alpha fixture is a rendered SVG, which is always RGBA, so
this path went unexercised while being the one the comments warn about.

A preset label is not a colour and is not accepted as one. `White (#FFFFFF)`
is the wording of a menu, and it used to be recognised at the form's edge and
turned into a colour there — which made display text part of what the program
accepted, so renaming a preset would have changed it. Nothing sends a label
any more: the form's list holds the colours themselves, and the stepwise
dialogs map their own list through `valueOfLabel` before anything is read. A
hex code is not fished out of whatever else was typed around it either, so
`use #C7DAE8 please` is a mistake worth reporting rather than an instruction
worth obeying.

## What a run remembers

Six settings, kept as one record under one key in a defaults domain of this
action's own. One record rather than six keys, because two runs finishing at
once can leave a paper size from one beside a background from the other; with
one record the last run to confirm its settings is the one whose settings are
there.

Not the standard defaults. "Standard" means the defaults of the application
that is running, and the application running a pasted script is Apple's
Shortcuts helper — so writing there would put this action's settings in
somebody else's domain, beside whatever every other script in that helper had
left behind. There is also no fallback to it when a named suite cannot be
made: a run that cannot remember opens on the compiled defaults, converts the
images, and says nothing about it. The completion dialog is about the
documents.

The record holds settings, not answers — what the pipeline stores, not what a
control was showing. A label is display text that renaming a preset would
change, and a record written last month should not depend on this month's
wording. It is read back through `normalizeSettings`, the same function that
validates a headless configuration rather than a second one that agrees with
it today: it has been on disk, where anything can edit it. Anything
unreadable, unrecognised or out of range is no answer at all.

The version is in the name of the key, `lastSettings.v1`, rather than in the
record. A record this version cannot read is one it must not overwrite either,
and a number inside the record cannot stop that: by the time the number is
read the run is already pointed at the key it is about to write, and it writes
there. Naming the key for the version means an older copy of this action
cannot reach what a newer one wrote, because it asks for a different key —
which matters because people keep more than one copy pasted about, at more
than one version. A later version can still read this one's key and bring it
forward, which is more than a number in the record ever offered.

Being unable to remember is a way of behaving rather than an absence. Every
way of failing to reach the defaults comes back as a memory that recalls
nothing and keeps nothing, never as nothing at all: a caller given nothing has
to remember to ask whether it got something, at every place it uses it, and
forgetting once put a null where a set of answers belonged. The form could not
read that, so a machine which merely could not save its settings was quietly
dropped into six sequential dialogs instead — the policy says convert anyway
and say nothing, and it is now written once instead of at each use.

Headless runs do not open it at all, and that is structural rather than a rule
to remember: the memory arrives as something to open rather than something
already open, and the branch that takes settings from a configuration file
returns before it can be. A file that also depended on what somebody chose in
a window last week would mean two different things on two machines.

Which branch that is comes from the invocation, which knows what kind of run
it is and says so, and never from what the settings look like. Valid JSON is
not yet a configuration either: `null`, `false`, `0`, a bare string and a list
all parse, and each is refused where the file is read rather than somewhere
further along, in words about the failure instead of about the file. Deciding by "there are no
settings, so somebody must be here to ask" is a guess, and a configuration
file holding `false` or `0` got it wrong: measured, a headless run took the
interactive branch, opened a dialog, and waited for an answer nobody was there
to give until it was killed.

Every copy of the action shares the domain, so a workflow kept for testing and
one used for real remember the same settings. That is deliberate — a pasted
script has no identity to tell copies apart by, and one tool with one set of
settings is what a person would expect — but it means testing with a spare
workflow changes what the real one opens on.

What makes remembering safe rather than surprising is that the form shows
every remembered value before a single image is touched. Nothing is applied
invisibly; a run that opens on last week's dark blue says so, in the control,
where it can be changed like anything else.

The round trip is the invariant. `answersFromSettings` is the exact inverse of
reading the form, and the two are in one file because inverses kept apart
drift: the tests put all 192 combinations of the settings through a record and
back, because the way this breaks is one setting quietly failing to survive
while the other five prove nothing. It is also why every choice control's
value is now what `normalizeSettings` produces — the output mode used to offer
`Single PDF` while the pipeline stored `single`, and an inverse of that would
have needed a table to undo a mapping that had no reason to exist. The two
older spellings are still accepted from a configuration file, because one
written against an earlier release has to keep working.

What is not tested, and cannot be: that a named suite is writable inside the
Shortcuts helper. This is the second such surface, alongside the AppKit form,
and that is the honest cost of the feature. It is checked by hand, on the real
Shortcut:

- convert something with settings that are not the defaults;
- run the action again and confirm the form opens on them;
- quit and relaunch Shortcuts, run again, and confirm they are still there;
- confirm nothing appears in the helper's own domain — `defaults read` for the
  helper must not show these settings, because a silent fall-through to the
  standard defaults is the one failure this design exists to prevent;
- run a headless conversion with a configuration file and confirm the
  interactive defaults are unchanged afterwards.

## Reading an answer

Both front ends read their answers through `src/core/answers.js`, and that is
the point of the file. The form asks six questions at once and collects every
problem; the stepwise dialogs ask one and ask again; what an answer may be,
and the sentence said when it may not, is the same either way.

The rule for a number used to be written three times over — the coercion for a
headless configuration, the form's own check, and the dialog's own check —
with three wordings for one rule, so the two front ends said different things
about the same answer. One reader now serves both, and it is deliberately
stricter than the coercion it sits beside: a typed answer is digits, where
`Number()` also reads `0x12C` and `3e2` as 300. A JSON configuration is a
different question, where a number is legitimately a number, and keeps the
coercion.

A rejected answer comes back for correction. Asking again with the setting's
default in the box threw away the one thing the person had that the program
did not — the value being corrected — and for a number it put back a figure
that looked as though it had been accepted: mistyping a resolution redisplayed
`300`. The reason goes into the prompt that asks again rather than into a
dialog of its own, which is what the form does with its problems, and it means
one dialog per mistake instead of two.

Cancelling stays outside all of it. `displayDialog` raises when a person
cancels, and that call sits outside the block that catches an unusable answer,
so a cancelled prompt cancels the run and can never be mistaken for a colour
that could not be read.

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

## Where progress is displayed, and what is still unmeasured

The action reports to two surfaces, and it reports to both rather than falling
back from one to the other. They are presented by different hosts: JavaScript
for Automation's own `Progress` object is displayed by Script Editor, by a
script applet and by the system script menu, and an `NSPanel` is what a
Shortcut can show. A run may be either.

It used to write only to `Progress`. That was chosen on the strength of what
happens when it is wrong — an assignment cannot open a window, cannot raise
the activation policy, and cannot pump a run loop underneath the host — and it
was the wrong trade, because the assignments succeed on a host that displays
none of them. Nothing could tell that apart from working, which is how this
action shipped with a conversion that says nothing for its entire length.

Two of the three objections are now answerable, and the third was never a
hazard:

- **Activation policy.** A window is activated by `activateIgnoringOtherApps`
  or by raising the policy to `regular`, and the panel does neither.
  `orderFrontRegardless` shows a window in a background application without
  activating it. The one policy change is `prohibited` to `accessory`, which
  is the smallest policy that can put a window on screen at all and shows
  neither a Dock icon nor a menu-bar item, and it is put back on close. A
  prohibited process can still run a modal session, which is exactly why the
  settings form displaying inside ShortcutsMacHelper was never evidence about
  a panel.
- **Run-loop re-entry.** The settings form calls `runModal`, which runs a
  nested modal session inside this host for as long as somebody takes over six
  fields. A 10 ms `runMode:beforeDate:` is a far shallower re-entry, and it is
  taken in `NSModalPanelRunLoopMode` rather than the default mode, because
  this code is executing inside an Apple Event and the default mode is where
  another one would be delivered.
- **Opening a window** is the feature that was missing.

### What was measured, and how

Not argued. The built artifact was run under `osascript -l JavaScript` with a
probe appended, and a screenshot was taken from another process while the
panel was held up:

- `osascript` runs with activation policy **prohibited**. That is the finding
  the whole design turns on: without the raise to accessory, `orderFront`
  would have shown nothing and the new surface would have been as invisible as
  the old one. It was a guess in the design and a fact afterwards.
- The panel renders. The screenshot shows the window, the bold headline, the
  secondary detail line reading "8 of 20 — IMG_1234.HEIC", and the accent bar
  over its track, in a process that is not the frontmost application.
- `-[NSWindow display]` followed by the bounded pump in
  `NSModalPanelRunLoopMode` composites, and does not hang.
- The activation policy reads back as prohibited again after `close`.

To repeat it: concatenate the artifact with a probe that calls `openPanel`,
and **end the probe with `$.exit(0)`**. Without it, `osascript` invokes the
artifact's own `run()` as soon as the top level finishes, and the process
sits on a settings dialog with nobody to answer it — which looks exactly like
a hang caused by the panel and is not one.

What is still unmeasured is the same thing as for the settings form: whether
this holds inside ShortcutsMacHelper, which is a different host. It is the
same JavaScriptCore and the same AppKit, so the mechanism is no longer the
question; only the host is. `PAINT_SECONDS` and the mode beside it in
`src/runtime/panel-window.js` are the knobs if it turns out to be.

Establishment is measured in either case: a panel that could not be built
returns null and is left out, and a run with no surface at all reaches
`SILENT` as a fact about the host rather than an assumption about it.

## A stop is a request, not a failure

A progress surface can report two different things by throwing, and only one
of them is about the surface. "I could not show this" is not news. "The person
asked you to stop" is not about the display at all -- the display is merely
where it arrived -- and it used to be discarded along with it, by the one
`catch {}` in `src/runtime/progress.js`.

**What is not established:** that any host actually raises one. Apple
documents a user-cancelled error for a script progress dialog, and it does not
follow that Script Editor, a script applet and the system script menu each
raise a catchable `-128` at the next `completedUnitCount` assignment rather
than terminating the script outright. There is no Stop button to press from a
shell, so this is unmeasured here and the branch is inert if nothing raises
one. It cannot arise inside a Shortcut at all: no progress object is
presented, and the panel is deliberately inert.

What is true regardless of the host, and is what carries the change: a
cancellation must never be recorded as a per-image failure, because it is not
a property of the photograph; and `isUserCancelled` must agree with
`commandOf`, twelve lines below it, which has always read the cause chain.

**Recorded, not thrown on.** Letting it out of the broadcast would unwind the
run from wherever the report happened to be made, and one of those places is
the middle of a publication -- which owns a finished PDF and a name it has
claimed, and whose header spends twenty lines on what happens when either is
let go at the wrong moment. So the run asks instead, at the places where
stopping is safe.

### The reports are the checkpoints

This is the third design for the same question and the first one that is not a
list. The first said "between images". The second added "and once the pages
are prepared, and once the PDF is built". Each time, an audit found the next
place nobody had thought of -- most recently `phase("Saving PDF")`, where a
stop was recorded and the PDF published anyway.

A list of places somebody thought of will never be finished. So look at what
was on it. Here is every progress call in the program:

| Call | Where | Relative to its work |
| --- | --- | --- |
| `beginning` | `pages.js`, `pdf-separate.js` | before |
| `about` | `pdf.js` | before |
| `phase("Creating PDF")` | `staging.js` | before |
| `phase("Validating PDF")` | `staging.js` | before |
| `phase("Saving PDF")` | `publish.js` | before |
| `phase(...)` twice | `main.js` | before |
| `finished("Preparing")` | `pages.js` | after |
| `finished("Saved")` | `pdf.js` | after |
| `finished("Saved" / "Failed")` | `pdf-separate.js` | after |

**The safe checkpoints and the "about to" reports are the same list**, and not
by coincidence: a report made before the work is made before anything has been
produced. So the rule is one sentence and needs no list at all:

> A report of what is about to happen may stop the run. A report of what has
> happened may not.

`beginning`, `about` and `phase` raise `UserCancelled`; `finished` never does,
because the work is finished and unwinding past it throws away the account of
it. Each `finished` is followed by the end of the run or by a `beginning`, so
nothing continues past a recorded stop merely because it does not raise.

**After saying rather than before**, which is the part that is easy to get
wrong: a host raises at the assignment *following* the button, so the report
that discovers a stop is the one being made. Checking first missed exactly
that case and carried on into the work it had just announced.

What the rule buys beyond correctness is that there is nothing to remember. A
stage added later says what it is about to do, because that is what the panel
exists to show, and in saying so it becomes a checkpoint. The default for a
new stage used to be "carries on after a stop"; it is "stops" now, and when a
rule is going to be got wrong occasionally it should be wrong in the direction
of doing less.

The inverted risk is real and is the thing to check: a report can now raise,
so every call site must be somewhere a raise is safe. The table above is that
check, and it is a minute's work to redo.

The last row of it is worth spelling out. `phase("Saving PDF")` sits *above*
the line that records the staged PDF in `job.unpublished`, so a raise there
leaves that set empty and `runJob` removes the workspace with the staged file
inside it. One line lower and the workspace would be retained with nothing
said about it, because a cancellation is silent.

There is no report at all inside a publication -- `confirm` says nothing --
so the transaction `publish.js` protects cannot be unwound by any of this.
That is a property of where the reports are, not a rule to keep.

### What the two modes say afterwards

A stop that produced nothing is a cancellation like any other and says
nothing. A stop with something behind it is an outcome and must be reported,
because producing files without saying where they are is the one thing
`completion.js` exists to prevent. Nothing means nothing *attempted*: an image
that failed still has to be shown.

A combined run reaches the first case by construction -- it publishes once, at
the end -- and a separate run can reach either. A separate run now stops
inside an image as well as between them, and the bound of "one image" that the
previous design argued for is gone with the reason for it.

Both places that read a result know about it: `isCompleteSuccess` treats a
stopped run as incomplete, so a headless caller gets the receipt *and* a
non-zero exit, and the completion message counts what it did not convert. Both
were added late, with the outcome rather than with the code producing it, and
both were wrong until an audit said so -- a stopped batch took the success
branch, and the dialog called an interrupted image one that was never started.

### Where a cancellation is not propagated, and why that is the answer

An audit asked for cancellation to be carried out of `linkFrom` and the copy
helpers, and in the same breath for it never to destroy an already-published
PDF or its only recovery copy. Those are the same request pulling in opposite
directions. Publication is a transaction -- measure the staged file, claim the
name, confirm the identity, release both copies -- and an exception thrown out
of a link attempt lands in the middle of it. Swallowing there is correct.

The same goes for `tryArgv`, `asks` and `isRegularNonEmpty`. The first is
`removeFile`, called from `finally` blocks, where an escape would mask the
error already on its way out and abandon the rest of the cleanup. The others
answer "the test succeeded", and `asking.js` has always said a "no" must not
be read as a fact about the file.

All of those findings need a `-128` to come out of `doShellScript`. Nothing
establishes that it can -- exit statuses are 0 to 255 and positive -- and
nothing disproves it either, because `do shell script` is an Apple Event.
Making the shell layer aware of a stop means a run-scoped flag threaded
through four helpers and every call site in five modules, or module-global
mutable state in a codebase that has none.

**This is a decision against, not a deferral**, and the measurement that
reopens it belongs in the same hand test as the Stop button: press Stop during
a conversion and read whether what arrives is a cancellation or a shell error.

What was taken from that neighbourhood is the ten lines that stop a separate
run from throwing its batch report away when a cancellation is raised from
inside one of its images. That is cheap and right under either premise.

## What a tool's exit status is not evidence of

`page-stages.js` has always said that "vips can exit zero having produced
nothing", and checked its own outputs accordingly. The same scepticism stopped
one level short: nothing asked whether the *source* had been read.

Measured on vips 8.18.6, a JPEG cut off inside its image data:

| | without a policy | with `--fail-on=error` |
| --- | --- | --- |
| truncated JPEG | exit 0, 362 KB salvaged | exit 1, refused |
| truncated PNG | exit 0, salvaged | refused |
| valid JPEG, PNG, TIFF, WebP | converts | converts |

Every check after the thumbnail passed on the salvaged file -- the output
exists, the page is written, pdfcpu validates strictly -- so half a photograph
was published as a finished conversion, silently. `error` is the level that
covers truncation and serious decoding errors; `truncated` catches only a
short file, and `warning` would also refuse files that merely have a quirk,
which is a different decision about what counts as a photograph.

The preflight probe carries the flag too. A flag the run depends on that the
probe does not exercise is how a vips too old to accept it fails in the middle
of a conversion instead of before one; measured, the probe still reaches
`VipsForeignLoad`, so `isVipsUsable` is unchanged.

This is the one finding in the round with an end-to-end proof available, and
`tests/integration/damaged.sh` is it: the unit suite cannot reach vips.

## Values from outside are read where they arrive

Two places took a string at face value and turned it into a path.

**A headless timestamp** went straight into `output_${timestamp}.pdf` with no
sanitizing, while the stem beside it had always been sanitized. `"2026/09/12"`
is a perfectly good string and is not a timestamp; interpolated, it is a PDF
in a folder nobody asked for, and it also defeats the byte budget that
measures the suffix precisely because a caller supplies it. Read at the
boundary now, in `src/core/timestamps.js`, where the rule lives beside the
thing that produces it -- so `readTimestamp(makeTimestamp(anyDate))` is a
property that can be asserted rather than a coincidence. Refused rather than
repaired: sanitizing an unusable value into a usable one would name the output
something the caller did not ask for and say nothing about it.

The name builders sanitize what they interpolate as well, the way
`stagedPdfPath` already sanitizes a token it generated itself. Not
belt-and-braces: `outputNameForCombined` returning a string with a separator
in it is a bug in that function's contract, whoever called it.

**A file URL** was a prefix strip rather than a parse, so the authority was
treated as part of the path. `file://remotehost/tmp/a.png` became the relative path
"remotehost/tmp/a.png", which the filesystem answers against whatever the
process's working directory happens to be -- and matching the longer prefix
first made it worse rather than better, turning
`file://localhostevil/tmp/a.png` into "evil/tmp/a.png". A file URL denotes a local absolute path or it
denotes nothing this action can open, and `""` is the existing answer for an
item that is not a path -- `selection.js` turns it into a stated rejection
naming the URL.

The leniency in percent-decoding did not stay, and it is worth writing down
that the first answer here was the wrong one. It was kept on the grounds that
a host handing over `file:///Users/x/100%.png` unencoded makes
`decodeURIComponent` throw and the undecoded string is the correct path. True,
and beside the point: keeping it gives two different URLs one meaning.
`file:///a/photo%20one%ZZ.png` is malformed -- a percent must be followed by
two hexadecimal digits -- and `file:///a/photo%2520one%25ZZ.png` is the
correct encoding of a file really called `photo%20one%ZZ.png`. Both resolved
to that file, so a malformed URL silently selected a photograph nobody had
named.

What is given up is one case: a host that emits unencoded URLs *and* a
filename with a percent that is not an escape. Unencoded spaces survive
either way, because `decodeURIComponent` does not object to them, and Finder
encodes. What is gained is that a URL this action cannot read becomes a
stated rejection naming it, rather than a file chosen by guesswork.

A NUL is the same sentence: `%00` decodes without complaint into a character
no path can hold, and it used to travel as far as the first shell command,
where `shellQuote`'s refusal was caught and reported as "not a readable file"
-- true, for the wrong reason. So the contract is: `file://`, an authority
that is empty or exactly `localhost`, a path beginning with `/`, escapes that
decode, and no NUL.

## The name appeared twice

Every separate-mode failure read:

```
photo.png: photo.png: Command failed while preparing the image.
```

`createSeparatePdf` wrapped its work in `withImageName`, which prefixes the
message with the image's name, and `failureRecord` carries the name beside it
-- so the dialog and the `message` field of the headless receipt both said it
twice. `withImageName`'s own comment says this cannot happen: "a separate run
does the same at its own boundary, so the name appears exactly once either
way". The boundary was there; the wrapper was left on top of it. A combined
run has nowhere else to say which image it was and still wraps.

## A temporary belongs to whoever asked for it

`preparePage` removes its two intermediates and returns the third, because the
caller needs it. A combined run holds every page until its single PDF is
built and must. A separate run needs one at a time, and was keeping all of
them until the workspace went at the end of the batch, so scratch storage grew
with every image converted. Each attempt takes its page with it now.

Deliberately not the rule the staged PDF follows: a validated PDF that could
not be published is kept for recovery, and a page is not.

That left the narrower case. The page is written before it is checked -- the
check exists because vips can exit zero having produced nothing -- so the
failure path is exactly the one where a page is already on disk, and
`preparePage` swept its two intermediates and left the third. Reproduced: two
images failing at the check left two pages behind and no `.v` files. The
contract is now one sentence, *a page or nothing left behind*, and it is kept
where the file is made, so both modes get it. The alternative -- having
separate mode work out the page's pathname in advance -- would put the
workspace naming scheme in a second module and fix one mode of two.

## The counter has one owner

The loop that owns an image opens and closes its unit, and nothing else
counts. That rule did not exist before, and what it cost was a defect nothing
was watching for: publication was the only thing that advanced the count, so
an image that failed on its way there was never counted as attempted. Three
images with the second failing ended at 2 of 3; three failures ended at 0 of
3, with the label reading "3 of 3".

`src/runtime/publish.js` now says what it is doing and counts nothing, which
is the subject its own header claims. `preparePage` no longer announces
itself: it is one step of an image rather than an image, and reporting from
there put the opening of a unit one level below the only code that knows an
image is one of several, with the closing three modules away.

## What the panel tests do not establish

The same limit as the settings form, and it is stated for the same reason: no
headless test can prove AppKit put anything on screen, and every check listed
below passes against a fake that renders nothing.

What is tested: that the window is asked for with the style mask, level and
flags the design depends on; that the rows are laid out top to bottom in
AppKit's bottom-left coordinate space; that the bar is hidden until there is a
total to draw in it; that no window is ordered front before the appearance
delay and one is at it; that pausing orders it out and starts the delay again;
that closing orders out, closes, and puts the activation policy back; and that
a host which refuses any of the objects yields no panel and leaves the process
exactly as it was found.

Two of those flags are load-bearing in a way a screenshot would not show. A
utility panel that does not clear `hidesOnDeactivate` is built, ordered front
and hidden again — silently, with every call reporting success — because this
process is never the active application. And the non-activating mask is the
difference between saying what a run is doing and taking the machine over
while it does it.

To find out the rest, by hand, on the real Shortcut:

1. Build, and paste `dist/Image-Files-to-PDF.jxa` into the Run JavaScript
   action.
2. Select about twenty large images in Finder and run the Quick Action with
   Shortcuts **not** frontmost.
3. The settings form must present exactly as it did before. It is the one
   thing the panel could affect without going near it: if the host was a
   prohibited process, it is an accessory one by the time the form is shown.
4. The panel must appear before the first conversion finishes, stay up through
   a slow image, advance its counter and its bar across images and across
   "Creating PDF", "Validating PDF" and "Saving PDF", never take focus, and be
   gone before the completion dialog.
5. Separate mode with one deliberately corrupt file: the counter must still
   reach n of n, and the failed image must say "Failed".
6. A two-image run that finishes in under half a second must put **no** window
   up at all.

Three levers, in the order they would be reached for. A window that never
repaints is the two knobs named above. Anything wrong at step 3 is
`allowWindows` in `src/runtime/panel-window.js`, and deleting the one call to
it gives up the panel on hosts that are prohibited and changes nothing else. A
panel that never appears at all was not established, and `Progress` is still
being written: no run is harmed either way, which is the property the whole
arrangement is built on.

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
AppKit's bottom-left coordinate space, that the background is a control which
is both a list and a field, that current answers are preselected, that a value
typed over a preset is the one read back, that what is being typed is
committed before it is read, that nothing is scheduled against the form, and
that each of the three outcomes — answered, cancelled, never presented — is
handled distinctly.

What is not tested and matters most for the background row: that an
`NSComboBox` in an alert's accessory view renders, opens its list, and can be
typed into inside the Shortcuts helper. Every check listed above passes
against a fake that cannot render anything, so the risk in that row sits
almost entirely outside them.

That was checked by hand on the real Shortcut, and it found both things such a
check is for. The control works — a colour typed over the value is accepted,
including when Create PDF is clicked immediately, without leaving the field —
and nobody could find that it could be typed into at all. The instruction was
in a tooltip, and the field read "White (#FFFFFF)", which is a menu's wording
and reads as a choice already made rather than a value to edit. It also made
an edit of it a mistake: replacing the code inside those brackets is a
perfectly good colour and was refused.

Everything in that control is a colour now, presets included, and it says
`or type #RRGGBB` beside itself, where the number rows state their range. No
headless check could have found that, and none of the ones listed above failed
while it was true.

It is checked by hand, on the real Shortcut, against this list:

- the row shows the current colour as a code, states `or type #RRGGBB` beside
  itself, and opens a list of the four presets as codes;
- a preset can be chosen with the mouse and with the keyboard;
- the text can be selected and replaced by typing or pasting;
- a pasted colour is accepted by pressing Create PDF immediately, without
  first pressing Tab or Return;
- a colour that is not six hex digits redisplays the form with the text as
  typed rather than replaced by a preset;
- nothing is completed for you while typing.

A value typed and submitted without leaving the field is the one that used to
be at risk everywhere, not only here: text lives in the window's field editor
until something commits it, and `stringValue` is what was last committed.
`validateEditing` is now called on every editable row before it is read, which
covers the resolution and quality fields as well.

The four backgrounds used to carry a colour swatch in their menu, drawn into
an `NSImage` for each. A combo box list holds strings and nothing else, and a
swatch shown beside the field instead would be telling the truth only until
the next keystroke — so the swatches went with the pop-up, and the names and
hex codes are what the list shows. That is the price of typing a colour at
all, and it was paid deliberately: no control offers both, and a second
control beside the first would be a second place for the answer to live.

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

One caveat about the figure itself, found by checking a survivor by hand
rather than trusting the report. `coverageAnalysis: "perTest"` decides which
tests to run against each mutant from what it recorded as covering that line,
and it under-attributes: the guard in `stoppedResults` was reported alive with
two tests covering it, while applying the same mutation by hand fails four.
The direction is safe -- the real score is at or above the reported one -- but
a survivor is a thing to reproduce, not a thing to read.

The mutants that remain alive are equivalent: they describe a program that
cannot behave differently from this one. They fall into seven groups.

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
- A body that is already a no-op. The silent progress reporter's seven methods
  exist to be called and do nothing, as does the pause a host's own `Progress`
  object has nothing to do for, so emptying them changes nothing; the same
  goes for a `catch` that returns `false` to a caller that only asks whether
  the answer is truthy.
- A guard the surrounding `catch` would answer identically. The bridge
  factories refuse a missing namespace before touching it, and removing that
  refusal only means the first message sent raises instead — caught two lines
  below, with the same result. The guard states a precondition where a reader
  needs it rather than leaving them to find the catch, and every one of these
  factories states it the same way. `openPanel` refusing an absent bridge is
  the same shape: without it the first message sent raises, and the catch
  below returns the same null.

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

The last run found nothing in the reworked prompts: no survivor in any file
this round changed.

The run before that found one thing that would have painted the wrong colour
on a page. The rule deciding whether vips was given one number or three was
that all three channels agree, and nothing distinguished it from either
channel pair agreeing on its own: `#C7C7E8` would have been sent as a single
199 and come out grey, silently, while still looking like a colour. Both the
rule and the shorter form it chose between are gone now — the one-band image
they existed for cannot reach the flatten — so the trap is closed by there
being nothing to choose. The rest of that run's survivors were the wording of
the colour prompt and the buttons on it, which are what a person answers.

The run before that found nothing new: every survivor in the publication path
was gone, and the one that remains there is equivalent -- a `catch` that returns
`false` to callers that only ask whether the answer is truthy, which is the
group already written down above.

The run before those found no wrong behaviour and two pieces of dead weight. Six of
its survivors were one finding wearing six faces: a label passed to `runArgv`
describes a failure for somebody to read, and six of them were attached to
commands whose failure is discarded where it happens -- text written for a
reader who does not exist. They are gone, along with the ad-hoc `try`/`catch`
around each one, in favour of `tryArgv`, which runs a command and takes
silence for an answer. Splitting that from the questions put to the
filesystem, which return an answer rather than fail, gave `asking.js` its own
module and left a dead predicate behind: `fileExists`, used by nothing but its
own tests, the leftover of a check that says "no" both when a file is absent
and when the question could not be put. The other dead weight was a counter
compared only against zero -- a flag wearing a number -- and the behaviour it
guarded, that a folder whose images are all already in the run is not called
empty, had nothing asserting it. The rest were assertions worth having: that a
publication which succeeded carries no reasons to explain itself, on both
routes to the name; that the drive-cannot-take-it message says what became of
the PDF and not only what failed; that a run whose output path holds another
program's file removes nothing at all; that whitespace around a `stat` answer
does not become part of an identity that is compared for equality; and that
the anchor on the file-URL prefix is load-bearing for a path already in POSIX
form.

The run before those found a cost rather than a wrongness, which is the same
thing at a distance: the batching measures the fixed part of the import
command so it knows how much room is left for pages, and measuring it with
every page already in it leaves nothing of the budget. The PDF still comes out
right — every page, in order — but a job of four thousand pages becomes four
thousand invocations of pdfcpu. The test now says a command carries more than
one page.

The run after the fallback audit found one thing worth holding: that a bridge
which will not take the header must not be used even when the operation looks
present on it, since the header is what makes it callable.

The run before that found nothing this code gets wrong: every
survivor fell into a group already written down here -- a description whose
command swallows it, a defensive conversion, and a list nothing reads on the
path that returns it.

The run before that found four, all about a message or a list that nothing was
reading: which of the two names a publication takes was
the one it could not take, and what a run removes -- on the ordinary path, on
the path through a staging copy, on a volume without hard links, and when it
refused before making anything. The last of those is the whole ownership rule
stated as an assertion, and it was worth writing down.

The run before that found two, both about an answer that looks like one: that a stat reporting a size and no file behind it identifies
nothing, and that two sizes neither of which could be read are not a match --
the check that a copy is whole has to know that its expectation was readable
in the first place.

The run before that found five, and one piece of dead code: that a rename which was refused has to say which of the two steps it
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
Poppler, and `osascript`. It runs six suites: `tests/integration/macos.sh`,
`tests/integration/background.sh`, `tests/integration/selection.sh`,
`tests/integration/publication.sh`, `tests/integration/volumes.sh` and
`tests/integration/cards.sh`.

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

The second is what colour ends up on the page, in `background.sh`, which the
section above describes.

The third exercises what the action decides to convert, which turns on what
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
  nothing refused;
- a real hard link named `.backup` beside the `.png` it shares a file with,
  and a real symbolic link beside its target: each photograph once, the
  unsupported name answered rather than swallowed, and the link refused.

The fourth takes the finished PDF from the workspace to the output folder:

- on one volume, where the whole publication is taking the name and clearing
  up: the PDF validates, the folder holds no staging file, and the published
  PDF has one name rather than two;
- a link whose target is gone, standing at the name the PDF was going to
  have: the link must survive and the PDF must be numbered past it, because
  `-e` calls such a link absent and a rename replaces it;
- an output folder `chmod 555` denies, where every way of getting the PDF in
  there fails: the message must name a recovery path that exists and holds a
  PDF that passes strict validation, and nothing may be left at the output
  path — neither a partial nor the staging file;
- a folder whose ACL denies `add_file` and allows `add_subdirectory`, on the
  boot disk, which does both operations: the place beside the destination is
  made and copied into and both ways of creating the name are refused, for a
  reason that is nothing to do with what the disk can do. The message must
  carry the system's "Permission denied" and must not name a drive or a
  volume at all.

The fifth and sixth publish to volumes attached for the test, which is the
only way to reach these paths at all. Each is skipped, loudly, where a volume
cannot be attached, because that is the machine's decision rather than the
code's.

The fifth is the cross-volume case:

- an APFS image, where the finished PDF and the output folder are on different
  filesystems, so the PDF is copied in and claimed from beside its
  destination — by a hard link, which is possible there even though one from
  the workspace was not.

The sixth is a camera card, which is formatted one of two ways:

- an MS-DOS image, where hard links do not exist — measured: `ln` refuses with
  "Operation not supported" — so the PDF is moved onto its name by the
  exclusive rename;
- an exFAT image, where neither exists, so publication stops: the volume must
  be left with nothing of the run's on it at all, the message must say the
  name could not be created and carry the system's own "Operation not
  supported", and the finished PDF must be recoverable from the path the
  message gives and pass strict validation. On FAT32 the PDF must validate,
  nothing of the run's may be left, and a name already holding another
  document must be stepped around with that document untouched.

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
| A cancellation discarded by the surface it arrived through | stop tests |
| A cancellation recorded as the photograph's failure | separate-mode stop tests |
| A cancellation hidden by the context wrapped over it | cause-chain tests |
| A caller's timestamp naming a folder instead of a file | timestamp tests + integration |
| A file URL resolving to a path relative to the working directory | file-URL tests |
| Half a damaged photograph published as a finished conversion | damaged-source integration |
| A failure naming the file it happened to twice | separate-mode failure tests + integration |
| A stop recorded too late for any loop to notice it | checkpoint tests |
| A PDF published after the run was asked to stop | checkpoint tests |
| A stop discovered by the very report that announced the work | reporter stop tests |
| A stopped run exiting zero with a success receipt | receipt tests |
| A dialog calling an interrupted image one that was never started | stopped-completion tests |
| A stopped run losing the report of what it had already published | separate-mode stop tests |
| Two different file URLs resolving to one path | file-URL tests |
| A page left behind by the check that rejected it | page-lifetime tests |
| Scratch storage growing with every image a separate run converts | page-lifetime tests |
| An image that failed never being counted as attempted | separate-mode counting tests |
| A conversion that says nothing because nobody presents the surface it writes to | two surfaces, and a hand test for the one that matters |
| A progress window left on screen in front of the completion dialog | run lifecycle tests |
| A valid source name producing an output name the filesystem refuses | filename budget tests |
| Two long numeric filenames sorting as equal | comparator tests |
| A finished PDF deleted because a check could not answer | ownership tests |
| A staging file this run did not create being adopted or removed | ownership tests |
| A refused claim turning into an operation that replaces | claim tests |
| A link whose target is gone being replaced | entry test + integration |
| One photograph converted twice because a Mac is case-insensitive | identity tests + integration |
| A newline in a folder name stopping the output numbering | naming tests + integration |
| Another writer's file reported as this run's published PDF | identity confirmation tests |
| A publication inferred from a file's absence | identity confirmation tests |
| An ineligible name for a file suppressing an eligible one | alias tests + integration |
| A symbolic link converting its target a second time | alias tests + integration |
| A failed copy leaving a hidden file nothing tracks | output-copy tests |
| A file another program put at the staging name being written over or removed | reservation tests |
| A document inside a folder at the output path removed for its name | unowned-file tests |
| A competing writer's file replaced by a refused claim becoming a rename | claim tests + MS-DOS volume integration |
| A publication left as an empty name | exclusive-rename tests + MS-DOS volume integration |
| A name created before the PDF could be put in it, and cleaned up by inspection | publication stops instead + exFAT volume integration |
| A link at the staging name adopted, and then deleted, as this run's | staging-area tests |
| A named pipe at the staging name hanging the run with no timeout | staging-area tests |
| A refusal explained by a cause that was never established | refusal tests + ACL folder integration |
| A volume with hard links refused because a bridge was missing | claim-order tests |
| A colour accepted by the settings and shown as no colour by the swatch | one colour parser, shared |
| A value typed and submitted without leaving the field being read as the one before it | field-editor commit tests |
| An answer being corrected replaced by the default when the question is asked again | retry-state tests |
| One rule stated in different words by the form and by the dialogs | shared reader tests |
| Tests that stop catching bugs | mutation testing with a break threshold |

## Acceptance boundary

The generated artifact still requires one successful Finder invocation on the
target account, because automation permissions and native dialog presentation
are account-specific.
