#!/usr/bin/env python3
"""Prove durable retention when Linux has no Downloads directory."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

ARTIFACT = Path(__file__).resolve().parents[2] / "dist/Image-Files-to-PDF.cjs"


def verify_recovery(root, mode):
    home = root / "home"
    source_dir = root / "source"
    state = root / "state"
    root.mkdir()
    home.mkdir()
    source_dir.mkdir()
    source = source_dir / "fixture.png"
    subprocess.run(["vips", "black", source, "64", "48", "--bands", "3"], check=True)
    original = source.read_bytes()
    settings = root / "settings.json"
    settings.write_text(json.dumps(
        dict(mode=mode, paperSize="A4", orientation="Portrait", resolutionLimit=300, quality=82, background="#FFFFFF")
    ), encoding="utf-8")
    source_dir.chmod(0o500)
    try:
        try:
            (source_dir / "negative-control").write_text("This write must fail.", encoding="utf-8")
        except PermissionError:
            pass
        else:
            raise AssertionError("The selected destination permits writes. Run as an unprivileged user.")
        env = {**os.environ, "HOME": str(home), "XDG_STATE_HOME": str(state), "XDG_CONFIG_HOME": str(root / "config")}
        result = subprocess.run(["node", ARTIFACT, "--settings", settings, "--", source],
                                env=env, capture_output=True, text=True, timeout=30)
        assert result.returncode == 1, result.stderr
        receipt = json.loads(result.stdout)
        assert receipt["state"] == "incomplete", result.stdout
        document, = receipt["documents"]
        assert document["state"] == "recovered", result.stdout
        assert document["sources"] == [str(source)], result.stdout
        assert [issue["code"] for issue in document["issues"]] == ["publication"], result.stdout
        recovery = Path(document["recovery"])
        workspace = state / "image-files-to-pdf/workspaces"
        assert recovery.is_relative_to(workspace), result.stdout
        assert not (home / "Downloads").exists()
        assert not source.with_suffix(".pdf").exists()
        assert source.read_bytes() == original
        subprocess.run(["pdfcpu", "validate", "--conf", "disable", "--mode=strict", recovery], check=True)
        subprocess.run(["qpdf", "--check", recovery], check=True)
        assert subprocess.check_output(["qpdf", "--show-npages", recovery], text=True).strip() == "1"
    finally:
        source_dir.chmod(0o700)


with tempfile.TemporaryDirectory(prefix="iftp-linux-recovery-") as folder:
    for output_mode in ("combined", "separate"):
        verify_recovery(Path(folder) / output_mode, output_mode)
print("Linux retained valid PDFs in durable workspaces without creating Downloads or reporting a Downloads failure.")
