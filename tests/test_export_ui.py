from spine.review import export_ui as X


def test_the_worker_pages_carry_the_local_dashboards_exact_look():
    assert X.GEN.read_text() == X.module(), "run: python -m spine.review.export_ui"
    for name, src in X.FILES.items():
        assert (X.STATIC / name).read_bytes() == src.read_bytes(), f"{name}: run python -m spine.review.export_ui"
