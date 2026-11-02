from datetime import datetime, timedelta, timezone

from spine.review import insights as I

UTC = timezone.utc
T0 = datetime(2026, 10, 26, 7, tzinfo=UTC)


def vid(i, views, pillar="A", at=None):
    return {"slot": f"s{i}", "title": f"v{i}", "at": at or T0 + timedelta(days=i), "pillar": pillar, "engine": "remotion",
            "part": "Morning", "views": views, "reach": views, "skip": 50.0, "watch": 1.0, "inter": 0, "shares": 0, "later": None}


def test_groups_compare_to_typical():
    vs = [vid(0, 10, "A"), vid(1, 10, "A"), vid(2, 40, "B"), vid(3, 40, "B")]
    g = {r["name"]: r for r in I.groups(vs, "pillar", 20)}
    assert g["B"]["vs"] == 2.0 and g["A"]["vs"] == 0.5


def test_findings_flag_small_samples_and_skip_placeholders():
    vs = [vid(0, 10, "A"), vid(1, 40, "B"), vid(2, 40, "B"), vid(3, 10, "No pillar"), vid(4, 90, "No pillar")]
    out = I.findings(vs, 20, {"Pillar": I.groups(vs, "pillar", 20)})
    assert any("B gets 2.0x more" in t and "hint" in t for t in out)
    assert not any("No pillar" in t for t in out)


def test_recommendations_skip_ones_already_tested():
    tables = {"Pillar": [{"name": "B", "n": 3, "views": 40, "vs": 2.0, "skip": 50}], "How it was made": [], "Time of day": []}
    assert [r["variable"] for r in I.recommendations(tables, [])] == ["pillar=B"]
    assert I.recommendations(tables, [{"variable": "pillar=B", "status": "planned"}]) == []


def test_thesis_counts_only_videos_after_it_started():
    start = T0 + timedelta(days=2, hours=1)
    exp = {"variable": "pillar=B", "created_at": start.isoformat(), "min_samples": 3}
    vs = [vid(0, 20), vid(1, 20), vid(2, 40, "B", T0 + timedelta(days=2))]          # last one is before the thesis
    assert I.thesis_result(exp, vs, 20)["n"] == 0
    vs += [vid(3, 40, "B"), vid(4, 50, "B"), vid(5, 60, "B")]
    r = I.thesis_result(exp, vs, 20)
    assert (r["n"], r["base"], r["verdict"]) == (3, 20, "worked")


def test_thesis_verdict_waits_for_enough_videos_and_can_fail():
    exp = {"variable": "pillar=B", "created_at": T0.isoformat(), "min_samples": 2}
    assert I.thesis_result(exp, [vid(1, 5, "B")], 20)["verdict"] is None
    assert I.thesis_result(exp, [vid(1, 5, "B"), vid(2, 6, "B")], 20)["verdict"] == "worse"


def test_account_week_sums_this_and_previous_seven_days():
    now = datetime(2026, 11, 2, tzinfo=UTC)
    days = [{"date": (now - timedelta(days=i)).date().isoformat(), "views": 1 if i < 7 else 10} for i in range(14)]
    assert I.account_week(days, "views", now) == (7, 70)


def test_thesis_with_zero_baseline_does_not_crash_and_stops_at_n_videos():
    exp = {"variable": "pillar=B", "created_at": (T0 + timedelta(days=3, hours=1)).isoformat(), "min_samples": 2}
    vs = [vid(0, 0), vid(1, 0), vid(4, 9, "B"), vid(5, 9, "B"), vid(6, 900, "B")]
    r = I.thesis_result(exp, vs, 0)
    assert r["verdict"] == "no clear change" and r["n"] == 2 and r["avg"] == 9
