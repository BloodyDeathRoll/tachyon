import pytest


@pytest.fixture(autouse=True)
def local_db(monkeypatch):
    """Every test runs on the local SQLite, whatever ~/.tachyon/worker.json says on this PC
    (spine/remote.py). tests/test_remote_db.py sets its own TACHYON_API."""
    monkeypatch.setenv("TACHYON_API", "")
