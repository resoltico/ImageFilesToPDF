#!/usr/bin/env bash
#
# Image fixtures for the macOS integration scenarios.

PROFILES=/System/Library/ColorSync/Profiles
P3_PROFILE="$PROFILES/Display P3.icc"
SRGB_PROFILE="$PROFILES/sRGB Profile.icc"

# solid_svg <path> <width> <height> <fill>
solid_svg() {
    cat > "$1" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="$2" height="$3">
  <rect width="$2" height="$3" fill="$4"/>
</svg>
SVG
}

require_tools() {
    local tool
    for tool in osascript vips vipsheader pdfcpu pdfinfo pdftoppm qpdf tiffcp; do
        command -v "$tool" >/dev/null
    done
    test -f "$P3_PROFILE"
    test -f "$SRGB_PROFILE"
}

# create_fixtures <workdir>
create_fixtures() {
    local work=$1

    solid_svg "$work/page10.svg" 900 600 "#235789"
    solid_svg "$work/page2.svg" 900 600 "#df2935"
    solid_svg "$work/tiny.svg" 64 64 "#3080c0"
    solid_svg "$work/red.svg" 400 400 "#E01010"

    cat > "$work/alpha.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">
  <rect width="600" height="900" fill="none"/>
  <circle cx="300" cy="450" r="180" fill="#f1d302" fill-opacity="0.55"/>
</svg>
SVG

    vips copy "$work/page10.svg" "$work/page 10 'quoted'.jpg[Q=90,keep=none]"
    vips copy "$work/page2.svg" "$work/page 2.png"
    vips copy "$work/alpha.svg" "$work/alpha image.png"
    vips copy "$work/tiny.svg" "$work/tiny.png"
    vips copy "$work/red.svg" "$work/red-srgb.png"

    # A HEIC, which is what an iPhone photo actually is, and a genuine
    # two-page TIFF, which must be refused rather than silently truncated.
    vips copy "$work/page2.svg" "$work/from iphone.heic"
    vips copy "$work/page2.svg" "$work/page-one.tif"
    vips copy "$work/page10.svg" "$work/page-two.tif"
    tiffcp "$work/page-one.tif" "$work/page-two.tif" "$work/two page scan.tif"

    # A wide-gamut source: pure sRGB red re-encoded into Display P3 and tagged.
    # This is what a modern macOS screenshot looks like. A pipeline that
    # ignores the embedded profile renders it noticeably desaturated.
    vips icc_transform "$work/red-srgb.png" "$work/wide gamut.png" \
        "$P3_PROFILE" --input-profile "$SRGB_PROFILE"
}

# write_config <path> <page> <orientation> <mode> <background> <timestamp>
write_config() {
    cat > "$1" <<JSON
{
  "paperSize": "$2",
  "orientation": "$3",
  "dpi": 72,
  "quality": 90,
  "mode": "$4",
  "background": "$5",
  "timestamp": "$6"
}
JSON
}

# create_selection_fixtures <workdir>
#
# What the selection suite selects from: a folder with a subfolder, a folder
# nobody can open, a hidden photograph, a file that is not an image, a package
# that is a folder to the shell, and two more names for one file -- a hard
# link with an extension this action does not take, and a symbolic link.
create_selection_fixtures() {
    local work=$1
    local image

    solid_svg "$work/blue.svg" 64 64 "#3080c0"
    mkdir -p "$work/album/sub" "$work/album/locked" "$work/Photos.app" \
        "$work/case" "$work/names"

    for image in album/a.png album/sub/b.png album/locked/c.png \
        album/.hidden.png Photos.app/x.png case/A.png names/image.png \
        names/extra.png; do
        vips copy "$work/blue.svg" "$work/$image"
    done

    echo "not an image" > "$work/album/notes.txt"
    ln "$work/names/image.png" "$work/names/image.backup"
    ln -s "$work/names/extra.png" "$work/names/alias.png"
}

# attach_test_volume <format> <name>
#
# A volume of its own, so the publication can be exercised where the finished
# PDF and the output folder are not on one filesystem -- and, for MS-DOS,
# where hard links cannot be made at all. Prints nothing and fails quietly
# when a volume cannot be attached: whether that is possible is the machine's
# decision rather than the code's.
attach_test_volume() {
    local format=$1 name=$2 image
    image=$(mktemp -t "ImageFilesToPDF-$name").dmg

    hdiutil create -size 40m -fs "$format" -volname "$name" -quiet -ov "$image" &&
        hdiutil attach -quiet "$image"
}
