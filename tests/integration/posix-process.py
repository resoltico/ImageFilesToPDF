#!/usr/bin/env python3
"""Native process, capture and restart checks against the distributed CJS."""
import json
import os
from pathlib import Path
import pty
import shutil
import signal
import subprocess
import tempfile
import time

REPO = Path(__file__).resolve().parents[2]
ARTIFACT = REPO / "dist/Image-Files-to-PDF.cjs"
NODE = Path(subprocess.check_output(["node", "-p", "process.execPath"], cwd=REPO, text=True).strip())


def wait_for(predicate, description):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        result = predicate()
        if result:
            return result
        time.sleep(0.02)
    raise AssertionError(description)


def args(settings, source):
    return [str(NODE), str(ARTIFACT), "--settings", str(settings), "--", str(source)]


def cli(settings, source, env, status=0, timeout=30):
    run = subprocess.run(args(settings, source), env=env, capture_output=True, text=True, timeout=timeout)
    assert run.returncode == status, run.stderr
    return json.loads(run.stdout)


def wrapper(directory, tool, operation):
    executable = directory / (tool + "-probe")
    executable.write_text(
        '#!/bin/sh\n'
        f'case "$*" in {operation})\n'
        '    printf "%s\n" "$$" > "$IFTP_TEST_STARTED"\n'
        '    while [ ! -f "$IFTP_TEST_RELEASE" ]; do sleep 0.04; done\n'
        '    printf "settled\n" > "$IFTP_TEST_FINISHED"\n'
        ';; esac\n'
        'exec "$IFTP_TEST_TOOL" "$@"\n',
        encoding="utf-8",
    )
    executable.chmod(0o700)
    return executable


def probe_env(folder, env, tool, executable):
    return {
        **env,
        f"IMAGE_FILES_TO_PDF_{tool.upper()}": str(executable),
        "IFTP_TEST_TOOL": shutil.which(tool),
        **{f"IFTP_TEST_{key.upper()}": str(folder / key) for key in ("started", "release", "finished")},
    }


def stop_from_terminal(folder, settings, source, env):
    stdout = folder / "receipt"
    stderr = folder / "stderr"
    pid, terminal = pty.fork()
    if pid == 0:
        with stdout.open("wb") as output, stderr.open("wb") as errors:
            os.dup2(output.fileno(), 1)
            os.dup2(errors.fileno(), 2)
            os.execve(NODE, args(settings, source), env)
    try:
        wait_for((folder / "started").exists, "the decoder did not start")
        os.write(terminal, b"\x03")
        time.sleep(0.2)
        assert os.waitpid(pid, os.WNOHANG)[0] == 0, "Stop must leave the in-flight command running"
        (folder / "release").touch()
        _, status = wait_for(lambda: (item := os.waitpid(pid, os.WNOHANG))[0] and item,
                             "the conversion did not stop after the decoder settled")
        assert os.waitstatus_to_exitcode(status) == 1, stderr.read_text()
        assert (folder / "finished").exists()
        assert json.loads(stdout.read_text())["state"] == "canceled"
        assert not source.with_suffix(".pdf").exists()
    except AssertionError as error:
        raise AssertionError(f"{error}: {stderr.read_text() if stderr.exists() else 'no stderr'}") from error
    finally:
        os.close(terminal)
        try:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
        except ProcessLookupError:
            pass


def crash_and_restart(folder, work, settings, source, env, delayed):
    child = subprocess.Popen(args(settings, source), env=delayed, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_for((folder / "started").exists, "the writer did not register")
        owner = next(file for file in work.glob("*/run-*/owner.json")
                     if json.loads(file.read_text())["pid"] == child.pid)
        guard = owner.parent / "command-in-flight"
        assert guard.exists()
        writer = int((folder / "started").read_text())
        child.kill()
        assert child.wait(10) == -signal.SIGKILL
        os.kill(writer, 0)
        again = cli(settings, source, env)
        assert guard.exists(), "startup removed a workspace with a live writer"
        assert any(item["code"] == "workspace-retained" and Path(item["diagnostic"]["path"]).samefile(owner.parent)
                   for item in again["diagnostics"])
        assert not (folder / "finished").exists()
    finally:
        (folder / "release").touch()
        wait_for((folder / "finished").exists, "the detached writer did not settle")
        if child.poll() is None:
            child.kill()
            child.wait(10)


def stale_owner(work, settings, source, env):
    program = """
const { workspaceStore } = require('./src/node/workspaces.js');
const { localFilesystem } = require('./src/node/filesystem.js');
const { spawnSync } = require('node:child_process');
const store = workspaceStore(localFilesystem(null), {
  request([exe,...argv]) { return spawnSync(exe,argv,{encoding:'utf8',env:{...process.env,LC_ALL:'C',TZ:'UTC'}}); }
}, null);
process.stdout.write(store.create());
"""
    directory = Path(subprocess.check_output([NODE, "-e", program], cwd=REPO, env=env, text=True))
    foreign = Path(tempfile.mkdtemp(dir=directory.parent, prefix="other-"))
    subprocess.run([NODE, ARTIFACT, "--help"], env=env, capture_output=True, check=True)
    invalid = subprocess.run([NODE, ARTIFACT, "--settings", settings], env=env, capture_output=True)
    assert invalid.returncode == 2 and directory.is_dir()
    result = cli(settings, source, env)
    assert foreign.is_dir() and not directory.exists()
    assert any(item["code"] == "workspace-reclaimed" and item["diagnostic"]["path"] == str(directory)
               for item in result["diagnostics"])
    assert next(work.glob("*/run-*/command-in-flight")).exists(), "an unknown writer marker was removed"


def changed_source(folder, settings, source, original, env):
    source.write_bytes(original)
    program = wrapper(folder, "vipsheader", "*changed.png*")
    delayed = probe_env(folder, env, "vipsheader", program)
    child = subprocess.Popen(args(settings, source), env=delayed, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        wait_for((folder / "started").exists, "the admission inspection did not start")
        successor = folder / "successor.png"
        subprocess.run(["vips", "black", successor, "32", "32"], check=True, capture_output=True)
        successor.replace(source)
        changed = source.read_bytes()
        (folder / "release").touch()
        stdout, stderr = child.communicate(timeout=30)
        assert child.returncode == 1, stderr
        receipt = json.loads(stdout)
        assert receipt["documents"][0]["state"] == "failed", stdout
        assert "source changed" in str(receipt["documents"][0]["issues"]).lower(), stdout
        assert source.read_bytes() == changed and changed != original
        assert not source.with_suffix(".pdf").exists()
    finally:
        if child.poll() is None:
            (folder / "release").touch()
            child.kill()
            child.wait(10)


def long_arguments(folder, settings, original, env):
    depth = folder
    for index in range(5):
        depth = depth / (str(index) + ("d" * 100))
    depth.mkdir(parents=True)
    sources = [depth / (f"{index:03d}" + ("n" * 165) + ".png") for index in range(205)]
    assert sum(len(os.fsencode(file)) + 1 for file in sources) > 131072, "the header query must require more than one argv batch"
    for file in sources:
        file.write_bytes(original)
    result = cli(settings, folder, env, timeout=180)
    assert result["state"] == "complete"
    document = result["documents"][0]
    assert document["sources"] == list(map(str, sources))
    assert int(subprocess.check_output(["qpdf", "--show-npages", document["output"]], text=True)) == len(sources)
    assert all(file.read_bytes() == original for file in sources)


def main():
    with tempfile.TemporaryDirectory(prefix="iftp-posix-") as directory:
        folder = Path(directory).resolve()
        work = folder / "temp"
        work.mkdir()
        env = {**os.environ, "TMPDIR": str(work)}
        settings = folder / "settings.json"
        settings.write_text('{"mode":"combined","paperSize":"A4","orientation":"Portrait","resolutionLimit":300,"quality":82,"background":"#FFFFFF"}')
        source = folder / "input.png"
        subprocess.run(["vips", "black", source, "64", "48"], check=True, capture_output=True)
        original = source.read_bytes()
        for check in ("terminal", "crash", "change"):
            (folder / check).mkdir()
        terminal = folder / "terminal"
        delayed = wrapper(terminal, "vips", "thumbnail*input-0*")
        stop_from_terminal(terminal, settings, source, probe_env(terminal, env, "vips", delayed))
        crash = folder / "crash"
        delayed = wrapper(crash, "vips", "thumbnail*input-0*")
        crash_and_restart(crash, work, settings, source, env, probe_env(crash, env, "vips", delayed))
        stale_owner(work, settings, source, env)
        changed_source(folder / "change", settings, folder / "change" / "changed.png", original, env)
        long_arguments(folder / "long-argv", settings, original, env)
        assert source.read_bytes() == original
        print("Native POSIX terminal Ctrl+C, detached writer at SIGKILL, dead-idle reclamation, changed source and split native argv passed.")


if __name__ == "__main__":
    main()
