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

## Workflows

The workflows are the one part of this project that has never executed, so a
mistake in them would surface on a first push rather than in the gate.
`actionlint` checks their schema, expression syntax, runner labels and the
shell inside `run:` steps. It is optional in the same way `shellcheck` is: the
gate stays runnable without it, and CI installs it.

Verified to fail: a runner label typo (`ubuntu-latests`) is rejected.

Every `uses:` must also be pinned to a full commit SHA. A tag is a moveable
label — whoever owns an action repository can point `v4` at different code
tomorrow, and it would run with whatever permissions the job holds. Dependabot
keeps the pins current. Short SHAs are refused too: they are ambiguous and can
be made to collide.

Verified to fail: `actions/checkout@v4`, `@main`, a bare name, and a
seven-character SHA are each rejected; a local `./.github/actions/...` action
is exempt, because it moves with this repository.

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

## Coverage

The figure covers all 18 production modules. Node's coverage reports only the
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
values are read back, that the modal is guarded by a watchdog scheduled in the
run loop mode a modal actually ticks, and that each of the three outcomes —
answered, cancelled, never presented — is handled distinctly.

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

The break threshold is 92, set below the measured score so ordinary changes
cannot fail CI on noise while a genuine drop still does. The score itself
moves by a tenth or two between runs, because a mutant that times out counts
as killed and the timeout is a wall clock; the run reports the current figure
and `stryker.config.json` records what it was when the threshold was last
raised.

The modules that score lowest are those whose file-reading wrappers are
exercised only by `tests/repo` and so cannot be killed by the mutation runner.
The shape to copy is a module that takes its world by parameter: it can be
driven against a fixture and proven to fail, not merely observed passing.
Raising the floor as the rest improve is tracked work, not a setting to relax.

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

`tools/lint/language-target.mjs` additionally refuses to run at all with an
empty rule list, for the same reason.

## Structure

No file may exceed 150 lines, enforced by the gate. A file that outgrows the
limit is split; the limit is not raised. Every core module has a matching test
file under `tests/unit/`.

## macOS integration gate

`npm run test:integration:macos` requires macOS, `vips`, `pdfcpu`, qpdf, libtiff,
Poppler, and `osascript`. It exercises:

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
| Tests that stop catching bugs | mutation testing with a break threshold |

## Acceptance boundary

The generated artifact still requires one successful Finder invocation on the
target account, because automation permissions and native dialog presentation
are account-specific.
