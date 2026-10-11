"""Isolate one bookmaker snapshot refresh so a blocked browser cannot freeze the service.

Standard-library only. No additional provider calls or new scheduler.
"""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile


class CaptureTimeout(RuntimeError):
    pass


def run_bounded_capture(worker_path, timeout_seconds=300):
    worker_path = Path(worker_path).resolve()
    with tempfile.TemporaryDirectory(prefix="ft-capture-") as d:
        target = Path(d) / "capture.json"
        env = dict(os.environ, FT_COLLECTOR_CHILD="1")
        proc = subprocess.Popen(
            [sys.executable, str(worker_path), str(target)],
            cwd=str(worker_path.parent),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=True,
        )
        try:
            output, _ = proc.communicate(timeout=timeout_seconds)
        except subprocess.TimeoutExpired as exc:
            # Kill the whole isolated group, including Playwright's browser.
            # The Gunicorn parent stays alive and can try again next quarter-hour.
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.communicate()
            raise CaptureTimeout(
                f"COLLECTOR_HARD_TIMEOUT_{timeout_seconds}s"
            ) from exc
        if output:
            print(output[-12000:], flush=True)
        if proc.returncode != 0:
            raise RuntimeError(f"COLLECTOR_CHILD_EXIT_{proc.returncode}")
        if not target.is_file():
            raise RuntimeError("COLLECTOR_CHILD_NO_OUTPUT")
        payload = json.loads(target.read_text(encoding="utf-8"))
        fixtures = payload.get("fixtures")
        snapshot = payload.get("snapshot")
        if not isinstance(fixtures, list) or not isinstance(snapshot, list):
            raise RuntimeError("COLLECTOR_CHILD_INVALID_SHAPE")
        if len(snapshot) > len(fixtures):
            raise RuntimeError("COLLECTOR_CHILD_INVALID_COUNTS")
        return fixtures, snapshot
