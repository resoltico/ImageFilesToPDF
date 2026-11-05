# Security

## Reporting

Report a suspected vulnerability privately through the repository's
[private vulnerability reporting](https://github.com/resoltico/ImageFilesToPDF/security/advisories/new),
not as a public issue. This is a personal project without a support commitment.

## File-safety boundary

Originals are read and copied, never opened for writing, moved or deleted. Folder
searches do not follow links or enter packages and skip hidden entries; an
explicitly selected item is checked on its own terms. Required file-kind, package,
identity and source-capture capabilities must be available; processing does not
fall back to weaker checks.

Candidates are inspected before consent and settings. Each admitted source is then
copied into an owned private workspace, and the same captured bytes are inspected
and decoded. Identity, version and image facts are checked around the capture, and
an observed change refuses the image. Coarse filesystem timestamps cannot guarantee
an atomic snapshot of an original that another program is changing, so stop other
writers while converting.

Separate-mode names are planned against the destination's actual rules. Native
folder identity and probes in an owned directory on the destination volume (the
workspace, or an OS-created temporary directory there) decide which names coincide;
ownership metadata is written before any probe name, and every allocated probe is
removed before encoding. Where no such directory can be made, Unicode comparisons
require reliable persistent identities and hard-link support. Missing facts stop
planning. An abrupt process end can leave a probe directory on the destination
volume; it holds ownership metadata and name tokens, never image or PDF bytes, and
workspace cleanup does not reclaim it.

A finished PDF is published with an exact-path hard link from the workspace. When
the destination is on another volume, an owned copy is first made beside the
destination and linked from there; on a volume that cannot link, it is published
by exclusive rename. Only a classified name collision is retried, with the next
` 2`, ` 3` name. Existing files, folders, pipes and links are never replaced or
written inside. Native identity and size confirm the actual output before the
workspace copy is released. A volume that supports neither exclusive route fails
over to recovery instead of exposing a partial file.

If a PDF cannot be published, it is recovered to `~/Downloads` under its intended
name with the same exclusive rules, or failing that to a confirmed copy in the system
temporary directory. Only a confirmed recovery releases the workspace copy; otherwise
the workspace is retained and its location reported. A candidate whose validation
faulted is reported as unconfirmed, never as a validated recovery. Stop keeps saved
PDFs and retains validated, unpublished work in its workspace. Temporary storage is
not permanent: move needed recovered or retained work promptly.

Each workspace records `owner.json` (process ID and start time) before any image
data, and a `retain` marker protects work entering validation. When a conversion
starts, only workspaces whose recorded process has ended and that carry no `retain`
marker are removed; retained, unreadable and ownerless workspaces are reported and
left alone. Help, version and invalid command-line requests do not run this cleanup.

## Embedded image metadata

An RGB JPEG without an embedded color profile, upright and within the resolution
limit is embedded byte for byte, including EXIF, GPS and other metadata inside it.
A PDF made from such an image is not a metadata-free copy: review the source
metadata before sharing it when location or camera details are sensitive. Every
other image is re-encoded without its metadata.

Remembered settings, under `com.resoltico.ImageFilesToPDF`, hold page settings only.

## Commands and trust

External commands are built as argument vectors and shell-quoted at the execution
boundary by `src/backend/shell.js`; NUL bytes are refused. Executables are
registered in `src/host/backend-executables.js`, and source rules refuse absolute
executable paths elsewhere. `IMAGE_FILES_TO_PDF_VIPS`,
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
that the tag still names the commit being released. The JXA, checksum manifest,
installation instructions and license are attestation subjects.

[README.md](README.md#verify-a-download) describes download verification.
Checksums and attestations do not verify a copy pasted into Shortcuts; replace it
with the complete verified file when installing a build.
