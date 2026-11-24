# Security

## Reporting

Report a suspected vulnerability privately through the repository's
[private vulnerability reporting](https://github.com/resoltico/ImageFilesToPDF/security/advisories/new),
not as a public issue. This is a personal project without a support commitment.

## File-safety boundary

Originals are read and copied without modification. The tree excludes links,
junctions and reparse points, packages where applicable, and hidden entries from
folder walks. The CLI treats Windows hidden attributes as hidden and requires
local drive paths. It refuses POSIX special files and source path components it
cannot verify. Explicitly selected hidden images are assessed individually.

The Quick Action inspects the selection before showing settings. The CLI
validates its request and settings before tool setup, reclamation or conversion.
Both re-inspect and render private captured bytes. The Node adapter opens a
regular source by handle, checks its identity, size and version against the
named path before and after the copy, and writes an exclusively created private
file. POSIX opens use no-follow and nonblocking flags where available. On
Windows the adapter checks reparse attributes along the path and compares the
open handle with the named path.

The capture checks detect ordinary replacement and concurrent edits. They do not
lock other applications out of a source or provide an atomic snapshot. Writers
able to race ancestor replacement, same-account attackers, and filesystems
without trustworthy identities and version facts are outside the trust boundary.
Convert stable sources in directories you trust.

Separate-mode naming uses actual namespace lookups and native directory identity.
Temporary comparison directories contain name tokens. An abrupt process end can
leave a comparison or staging directory on the destination volume.

A validated PDF is claimed at its final path using an exclusive hard link.
For cross-volume publication, a complete owned copy is staged beside the
destination first. The Finder adapter also has an exclusive macOS rename route.
Only an observed existing entry triggers a suffix retry. The requested
destination must be readable and searchable so the tool can confirm the stored
basename, size and identity before releasing the verified original. A possibly
successful but unconfirmed claim leaves the public entry and private original in
place. If even the original cannot be verified, the result reports uncertainty
without supplying a recovery path. An unavailable exclusive route tries
Downloads under the same rules, then keeps verified private work. Stop and
receipt transport failures preserve validated or confirmed files.

Workspace metadata records process identity and retention before use. The Node
workspace root is private to the current user, using POSIX ownership and
permissions or a verified Windows access-control list. Its owner record binds
the directory's identity to a process ID and start discriminator. A guard
created before any workspace-writing command is removed after a correlated
settlement reply. Interruption before that reply leaves an unknown writer, so a
later run preserves the workspace even if its owner died. Startup only reclaims
recognized, unretained work whose recorded owner instance has ended and whose
writer guard is absent. The Quick Action uses its own workspace records.
Temporary storage can be cleared by the OS.

## Embedded image metadata

A standard-range RGB JPEG without an embedded color profile, upright and within
the resolution limit is embedded byte for byte, including EXIF, GPS and other
metadata inside it. A PDF made from such an image is not a metadata-free copy: review the source
metadata before sharing it when location or camera details are sensitive. Every
other image is re-encoded without its metadata. Ultra HDR JPEGs are normalized to
their SDR base image; the gain map is excluded from pass-through and from the PDF.

Remembered settings, under `com.resoltico.ImageFilesToPDF`, hold page settings only.

## Commands and trust

External commands are built as argument vectors. Node passes them directly to
the native executable. The Finder adapter quotes them for the shell.
Executable discovery and overrides select trusted installed tools. `IMAGE_FILES_TO_PDF_VIPS`,
`IMAGE_FILES_TO_PDF_VIPSHEADER` and `IMAGE_FILES_TO_PDF_PDFCPU` can name explicit
executables; they select trusted tools and are not a sandbox.

The action runs with your user permissions and trusts the installed `vips`,
`pdfcpu` and supporting system tools. pdfcpu runs with `--conf disable`, so it reads
no personal configuration, fonts or certificate stores. The action makes no network
requests; installing tools and verifying attestations need network access.
Diagnostics can contain source and output paths and the underlying commands; review
them before sharing.

## Distribution integrity

The release workflow requires the generated artifact to reproduce the committed
bytes, verifies checksums and build attestations before publication, and checks
that the tag still names the commit being released. Both bundles, the checksum manifest,
installation instructions and license are attestation subjects.

[README.md](README.md#verify-a-download) describes download verification.
Checksums and attestations do not verify a copy pasted into Shortcuts; replace it
with the complete verified file when installing a build.
