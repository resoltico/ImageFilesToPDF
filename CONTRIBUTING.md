# Contributing

## Working on this

```sh
npm ci
npm run release
```

`npm run release` regenerates `dist/` and runs the full gate. `npm run quality`
runs the gate without regenerating, which is what CI does, so that a stale
committed artifact fails instead of shipping.

The macOS integration gate needs the real tools and is run separately:

```sh
brew install vips pdfcpu qpdf poppler libtiff shellcheck actionlint
npm run test:integration:macos
```

## What the gate enforces

`QA.md` is the contract. It specifies every check, its threshold, and why the
guard exists — file size, coverage, ESLint mode, the language target, mutation
score, and the facts that must agree across files.

This file does not restate those rules, so that there is one place to change
when they move.

Two things worth knowing before you write code, because they shape where things
go rather than merely passing or failing:

- **A test belongs in `tests/unit/` if it takes its world by parameter, and in
  `tests/repo/` if it inspects the real repository.** Only the former is
  meaningful under mutation, where the tree is deliberately altered.
- **Rules that are switched off are listed with their reasons** in
  `tools/eslint/rules.mjs`. Add to that list only with a reason, never in bulk.

## Source layout

`src/` holds small single-purpose CommonJS modules so each can be required and
unit tested on its own:

- `src/core/` — the portable planner: settings, geometry, paths, naming,
  ordering, shell quoting, argv construction, invocation parsing, preflight
  probes, errors.
- `src/runtime/` — the macOS host: shell execution, tool discovery, preflight,
  workspace, dialogs, the AppKit form, input resolution, page preparation, PDF
  creation, publication, job assembly, entry point.

Two front ends ask for the settings, and `settings-form.js` chooses between
them: the AppKit form first, the stepwise dialogs if it cannot be presented.
Both are driven from the same control definitions in `src/core/choices.js`,
so they cannot offer different options or accept different values — there is a
test asserting exactly that.

`appkit-widgets.js` is the only module that touches AppKit, and it takes the
ObjC namespace as a parameter rather than reaching for the `# Contributing

## Working on this

```sh
npm ci
npm run release
```

`npm run release` regenerates `dist/` and runs the full gate. `npm run quality`
runs the gate without regenerating, which is what CI does, so that a stale
committed artifact fails instead of shipping.

The macOS integration gate needs the real tools and is run separately:

```sh
brew install vips pdfcpu qpdf poppler libtiff shellcheck actionlint
npm run test:integration:macos
```

## What the gate enforces

`QA.md` is the contract. It specifies every check, its threshold, and why the
guard exists — file size, coverage, ESLint mode, the language target, mutation
score, and the facts that must agree across files.

This file does not restate those rules, so that there is one place to change
when they move.

Two things worth knowing before you write code, because they shape where things
go rather than merely passing or failing:

- **A test belongs in `tests/unit/` if it takes its world by parameter, and in
  `tests/repo/` if it inspects the real repository.** Only the former is
  meaningful under mutation, where the tree is deliberately altered.
- **Rules that are switched off are listed with their reasons** in
  `tools/eslint/rules.mjs`. Add to that list only with a reason, never in bulk.

## Source layout

`src/` holds small single-purpose CommonJS modules so each can be required and
unit tested on its own:

- `src/core/` — the portable planner: settings, geometry, paths, naming,
  ordering, shell quoting, argv construction, invocation parsing, preflight
  probes, errors.
 global. That is
what lets the form composition be unit tested against a fake. What a fake
cannot establish is that AppKit renders any of it; that was verified by
running a probe inside the Shortcuts helper, and is why the fallback exists.

The runtime layer takes `app` as a parameter rather than reaching for a global,
which is what lets the whole macOS host be driven from Node by a fake host with
an in-memory filesystem — including the non-clobbering publish, which a
stateless stub cannot exercise.

Each module has its own test file under `tests/unit/core/` or
`tests/unit/runtime/`.

## The released artifact

Do not edit it. `dist/Image Files to PDF.jxa` is generated from the modules
under `src/` by `tools/bundle.mjs`, which concatenates the module bodies with
their `require` and `module.exports` lines removed. Everything then shares one
script scope and `run` stays top level, where `osascript` finds it. The bundler
fails the build on a duplicate top-level name or an out-of-order dependency.

Edit the sources, run `npm run release`, and commit both.

`INSTALL.txt` ships with it, and is deliberately plain text rather than
Markdown. It is a release asset: someone downloads it alongside the `.jxa` and
opens it in a text editor, where `##` and backticks would be clutter rather
than formatting. The repository's own documents are Markdown because they are
read rendered on GitHub. Do not convert it.

## Releasing

A release is a tag. Pushing `v<version>` runs the release workflow, which
qualifies the tagged source on macOS, rebuilds the artifact on a clean runner,
and publishes it with a build attestation.

Three things are checked that a local build cannot check:

- **The tag names the version the repository already agrees on.**
  `tools/check-tag.mjs` compares it against the value the consistency gate
  derives from all six files, so tagging cannot paper over a disagreement.
- **The build is reproducible.** CI runs `npm run check-dist` first, so the
  committed artifact is proven to match `src/` while it is still untouched,
  then rebuilds and requires `git diff --exit-code -- dist/` to be clean. What
  is attested is therefore both built on GitHub and identical to what was
  reviewed here.
- **The tag still points at the commit being built.** A tag can be moved after
  it is pushed; the publish job re-resolves it and `gh release create
  --verify-tag` refuses one that has since changed.

Release notes come from `CHANGELOG.md` rather than a per-tag file, because a
second copy of the same prose is a second thing to keep in agreement.

Building locally is unchanged: `npm run release` still builds and gates, and
the committed `dist/` is still what the repository is reviewed against.

## Bumping Node

The Node version appears in `.node-version`, `mise.toml` and `engines`. The
gate asserts they agree, but nothing watches for newer releases: Dependabot
does not track version files, so bumping is a deliberate manual step.

The Homebrew tools are not pinned at all — CI installs the current ones on
every run, so a breaking change there surfaces as a failing integration job
rather than as a silent drift.
