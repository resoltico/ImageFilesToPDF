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
import sys

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


def helper_pid(engine):
    if sys.platform != "darwin":
        return None
    for line in subprocess.check_output(["/bin/ps", "-axo", "pid=,ppid=,comm="], text=True).splitlines():
        pid, parent, command = line.strip().split(None, 2)
        if int(parent) == engine and Path(command).name == "osascript":
            return int(pid)
    return None


def wait_for_helper(engine):
    return wait_for(lambda: helper_pid(engine), "the macOS engine helper did not start") if sys.platform == "darwin" else None


def wait_for_helper_exit(helper):
    if helper is None:
        return

    def exited():
        status = subprocess.run(["/bin/ps", "-p", str(helper), "-o", "stat="], capture_output=True, text=True)
        return status.returncode == 1 and not status.stdout.strip()

    wait_for(exited, "the macOS helper survived the engine")


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
        '    if [ -n "${IFTP_TEST_AFTER_SAVE:-}" ] && [ ! -f "$IFTP_TEST_AFTER_SAVE" ]; then\n'
        '        exec "$IFTP_TEST_TOOL" "$@"\n'
        '    fi\n'
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


def stop_from_terminal(folder, settings, source, env, saved=None):
    stdout = folder / "receipt"
    stderr = folder / "stderr"
    pid, terminal = pty.fork()
    if pid == 0:
        with stdout.open("wb") as output, stderr.open("wb") as errors:
            os.dup2(output.fileno(), 1)
            os.dup2(errors.fileno(), 2)
            os.execve(NODE, args(settings, source), env)
    reaped = False
    try:
        wait_for((folder / "started").exists, "the decoder did not start")
        helper = wait_for_helper(pid)
        before = saved.read_bytes() if saved else None
        os.write(terminal, b"\x03")
        time.sleep(0.2)
        assert os.waitpid(pid, os.WNOHANG)[0] == 0, "Stop must leave the in-flight command running"
        (folder / "release").touch()
        _, status = wait_for(lambda: (item := os.waitpid(pid, os.WNOHANG))[0] and item,
                             "the conversion did not stop after the decoder settled")
        reaped = True
        assert os.waitstatus_to_exitcode(status) == 1, stderr.read_text()
        assert (folder / "finished").exists()
        receipt = json.loads(stdout.read_text())
        assert receipt["state"] == "canceled"
        if saved:
            document = receipt["documents"][0]
            assert document["state"] == "saved" and Path(document["output"]) == saved
            assert saved.read_bytes() == before
            assert not (source / "second.pdf").exists()
            subprocess.run(["pdfcpu", "validate", "--conf", "disable", "--mode=strict", saved],
                           check=True, capture_output=True)
        else:
            assert not source.with_suffix(".pdf").exists()
        wait_for_helper_exit(helper)
    except AssertionError as error:
        raise AssertionError(f"{error}: {stderr.read_text() if stderr.exists() else 'no stderr'}") from error
    finally:
        (folder / "release").touch()
        os.close(terminal)
        if not reaped:
            try:
                os.kill(pid, signal.SIGKILL)
                os.waitpid(pid, 0)
            except ProcessLookupError:
                pass


def stop_after_publication(folder, settings, original, env):
    folder.mkdir()
    inputs = folder / "album"
    inputs.mkdir()
    for name in ("first.png", "second.png"):
        (inputs / name).write_bytes(original)
    separate = folder / "separate.json"
    separate.write_text(settings.read_text().replace('"combined"', '"separate"'), encoding="utf-8")
    saved = inputs / "first.pdf"
    tool = wrapper(folder, "vips", "thumbnail*input-0*")
    delayed = {**probe_env(folder, env, "vips", tool), "IFTP_TEST_AFTER_SAVE": str(saved)}
    stop_from_terminal(folder, separate, inputs, delayed, saved)
    assert sorted(file.name for file in inputs.iterdir()) == ["first.pdf", "first.png", "second.png"]
    assert all(file.read_bytes() == original for file in inputs.glob("*.png"))


def crash_and_restart(folder, work, settings, source, env, delayed):
    child = subprocess.Popen(args(settings, source), env=delayed, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_for((folder / "started").exists, "the writer did not register")
        helper = wait_for_helper(child.pid)
        owner = next(file for file in work.glob("run-*/owner.json")
                     if json.loads(file.read_text())["pid"] == child.pid)
        guard = owner.parent / "command-in-flight"
        assert guard.exists()
        writer = int((folder / "started").read_text())
        child.kill()
        assert child.wait(10) == -signal.SIGKILL
        wait_for_helper_exit(helper)
        os.kill(writer, 0)
        again = cli(settings, source, env)
        assert guard.exists(), "startup removed a workspace with a live writer"
        assert any(item["code"] == "workspace-retained" and Path(item["diagnostic"]["path"]).samefile(owner.parent)
                   for item in again["diagnostics"])
        assert not (folder / "finished").exists()
    finally:
        (folder / "release").touch()
        if (folder / "started").exists():
            wait_for((folder / "finished").exists, "the detached writer did not settle")
        if child.poll() is None:
            child.kill()
            child.wait(10)


def stale_owner(work, settings, source, env):
    program = """
const { workspaceStore } = require('./src/engine/workspaces.js');
const { localFilesystem } = require('./src/engine/filesystem.js');
const { spawnSync } = require('node:child_process');
(async () => {
  const store = await workspaceStore(localFilesystem(null, null), {
    request([exe,...argv]) { return spawnSync(exe,argv,{encoding:'utf8',env:{...process.env,LC_ALL:'C',TZ:'UTC'}}); }
  }, null);
  process.stdout.write(await store.create());
})().catch((error) => { process.stderr.write(String(error)); process.exitCode = 1; });
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
    assert next(work.glob("run-*/command-in-flight")).exists(), "an unknown writer marker was removed"


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
        home = folder / "home"
        home.mkdir()
        state = folder / "state"
        workspace = (home / "Library/Application Support/Image Files to PDF/Workspaces"
                     if sys.platform == "darwin" else state / "image-files-to-pdf/workspaces")
        env = {**os.environ, "TMPDIR": str(work), "HOME": str(home), "XDG_STATE_HOME": str(state), "XDG_CONFIG_HOME": str(folder / "config")}
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
        stop_after_publication(folder / "after-save", settings, original, env)
        crash = folder / "crash"
        delayed = wrapper(crash, "vips", "thumbnail*input-0*")
        crash_and_restart(crash, workspace, settings, source, env, probe_env(crash, env, "vips", delayed))
        stale_owner(workspace, settings, source, env)
        changed_source(folder / "change", settings, folder / "change" / "changed.png", original, env)
        long_arguments(folder / "long-argv", settings, original, env)
        assert source.read_bytes() == original
        print("Native POSIX terminal Ctrl+C before and after a save, detached writer at SIGKILL, dead-idle reclamation, helper exit, changed source and split native argv passed.")


if __name__ == "__main__":
    main()
