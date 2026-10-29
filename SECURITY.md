# Security

## Reporting

This personal project has no support commitment. Use the repository issue tracker
for public reports. Request a private reporting channel before sharing sensitive
files, paths or details in an issue.

## File-safety boundary

Source images are read and copied, never modified by the action. Folder traversal
does not follow links or enter packages; hidden entries are skipped by the walk.
Explicit selection is validated independently. Required file-kind, package,
identity and source-capture capabilities must be available; processing does not
fall back to weaker checks.

Each admitted source is captured into an owned private workspace. Inspection and
decoding consume the same captured bytes. Required facts are checked around
capture, and observed changes are refused. Coarse filesystem timestamps cannot
establish an adversarial atomic snapshot of a changing original.

Publication uses native exact-path hard linking or exclusive rename of an owned
destination copy. Only classified collisions are retried. Existing files,
directories, pipes and links are not replaced or written inside. Native identity
and size confirm the actual output before the validated workspace copy is
released. Unsupported atomic-publication routes fail with recovery.

One registered artifact lifecycle controls workspace retention. Validated,
unconfirmed work remains owned through faults and cancellation. A recovery copy
must succeed and pass native checks before the original is released. Uncertain
validation candidates are identified separately from validated recoveries.
Cleanup removes owned resources; it does not adopt paths based on spelling or
infer ownership from an unknown existence result. Recovery and unresolved-work
locations may intentionally remain in the system temporary directory.

## Commands and trust

External commands use argument vectors quoted by
`src/backend/shell.js`; NUL bytes are rejected. Executable names are
centralized in `src/host/backend-executables.js`, with source rules restricting
absolute executable paths elsewhere. Native publication uses numeric error
classification and immediate native identity checks.

The action runs with its host/user permissions and trusts the installed vips,
pdfcpu and supporting system tools. Explicit backend overrides select trusted
executable paths; they are not a sandbox. The action does not make network
requests. Installing/updating tools and verifying GitHub attestations require
network access.

pdfcpu commands use `--conf disable`, without reading or changing personal
configuration, fonts or certificate stores. Interactive preferences store page
settings only, under `com.resoltico.ImageFilesToPDF`. Diagnostics can contain
source/output paths and underlying commands; review them before sharing.

## Distribution integrity

The release workflow requires the generated artifact to reproduce committed
bytes. It verifies checksums and build attestations before publication and checks
that the tag still identifies the commit being released. The JXA, checksum
manifest, installation instructions and license are attestation subjects.

[README.md](README.md#verify-a-download) describes download verification.
Checksums and attestations do not verify an installed pasted copy in Shortcuts;
replace it with the complete verified artifact when installing a build.
