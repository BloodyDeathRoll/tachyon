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
    out = I.findings(vs, 20, {"Topic": I.groups(vs, "pillar", 20)})
    assert any("B videos: 2.0x the views" in f["text"] and f["pct"] is not None for f in out)
    assert not any("No pillar" in f["text"] for f in out)


def test_recommendations_only_include_picks_that_beat_typical():
    vs = [vid(0, 10, "A"), vid(1, 10, "A"), vid(2, 40, "Swell map"), vid(3, 40, "Swell map")]
    r = I.recommendations(vs, {"Topic": I.groups(vs, "pillar", 20), "How it was made": [], "Time of day": []})
    assert [(x["title"], x["vs"]) for x in r] == [("Show swell map", 2.0)] and 0 <= r[0]["pct"] <= 99


def test_account_week_sums_this_and_previous_seven_days():
    now = datetime(2026, 11, 2, tzinfo=UTC)
    days = [{"date": (now - timedelta(days=i)).date().isoformat(), "views": 1 if i < 7 else 10} for i in range(14)]
    assert I.account_week(days, "views", now) == (7, 70)


def test_certainty_is_high_for_a_clear_gap_low_for_noise_and_none_for_everyone():
    vs = [vid(i, 10 + i, "A") for i in range(8)] + [vid(8 + i, 100 + i, "B") for i in range(4)]
    assert I.certainty(vs, "pillar", "B", 1) >= 98
    assert I.certainty(vs, "pillar", "A", 1) < 20 and I.certainty(vs, "pillar", "A", 1, lower=True) > 90
    assert I.certainty(vs, "pillar", "Z", 1) is None


def test_certainty_does_not_hang_on_many_videos():
    vs = [{"views": i, "pillar": "A" if i % 2 else "B"} for i in range(60)]
    assert I.certainty(vs, "pillar", "A", 1) is not None
