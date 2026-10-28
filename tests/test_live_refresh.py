from spine.review import app


def test_failed_pull_is_not_retried_within_a_minute(monkeypatch):
    calls = []
    monkeypatch.setattr(app, "_TRIED", {})
    monkeypatch.setattr("spine.measure.insights.snapshot_account_7d", lambda c: calls.append(c) or 1 / 0)

    class DB:
        def snapshots(self, _):
            return []

    app.refresh_account("demo", DB())
    app.refresh_account("demo", DB())
    assert calls == ["demo"]
