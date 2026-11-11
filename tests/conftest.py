import json
import subprocess
from pathlib import Path

import pytest

WORKER = Path(__file__).resolve().parent.parent / "deploy" / "worker"


@pytest.fixture(autouse=True)
def local_db(monkeypatch):
    """Every test runs on the local SQLite, whatever ~/.tachyon/worker.json says on this PC
    (spine/remote.py). The tests that talk to the Worker set their own TACHYON_API."""
    monkeypatch.setenv("TACHYON_API", "")


@pytest.fixture(scope="session")
def worker():
    """The real Worker on a local port (deploy/worker/test/serve.mjs, Miniflare): {"url", "token"},
    the token being alice's, a member of rosa. Skipped without node_modules."""
    if not (WORKER / "node_modules").exists():
        pytest.skip("deploy/worker has no node_modules (npm install)")
    p = subprocess.Popen(["node", "test/serve.mjs"], cwd=WORKER, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    try:
        line = p.stdout.readline()
        if not line:
            pytest.fail(f"serve.mjs gave no address (exit {p.wait()})")
        yield json.loads(line)
    finally:
        p.stdin.close()
        p.wait(timeout=30)
