# Security

## Reporting

This is a personal tool with no support commitment. Open an issue, or contact
the author directly if the problem should not be public first.

## What the tool does with your files

- Source images are read, never modified.
- Output PDFs are written beside their source — beside the first selected image
  for one combined PDF, beside each image for separate ones — and never
  overwrite an existing file: the name is suffixed until it is free, and
  publication is a non-clobbering `mv -n`, falling back to `cp -n` verified by
  size, followed by a re-check.
- Intermediates are held in a private `mktemp -d` directory and removed on
  success and on failure. The directory is checked against the expected
  `mktemp` shape before anything is removed recursively.
- A finished PDF that cannot be published is the one exception: it is moved to
  a recovery folder and the failure message says where, rather than being
  deleted along with the workspace. It has been imported and validated by that
  point, so removing it would destroy completed work over a naming clash.
- Nothing is sent anywhere. The tool makes no network requests.

## Shell safety

Every external command is built as an argument vector and quoted through a
single function (`src/core/shell.js`), so a filename can never be interpreted
as shell syntax. That function rejects NUL bytes, and the unit tests execute
hostile filenames — quotes, `$HOME; touch NO`, newlines, globs — through
`/bin/sh` to confirm each argument survives as exactly one value.

ESLint runs in its strictest mode, which rejects `eval`, `new Function` and
their implied forms. Every binary the action runs is named in
`src/core/executables.js` and nowhere else, and the gate refuses an absolute
executable path written anywhere else under `src/` — so the action's external
surface is a file you can read rather than something to reassemble.

## The released file

Every file a release offers is signed with a GitHub build attestation, and the
artifact is rebuilt on a clean runner during the release and required to
reproduce the committed bytes exactly. `README.md` and `INSTALL.txt` give the
command to check it.
