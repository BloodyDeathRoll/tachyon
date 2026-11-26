"""spine.render.settled_shot: a frame is kept only once the page has stopped redrawing."""
from spine.render import settled_shot


class Page:
    """Screenshots come back in order: (probe, png, probe) per try."""
    def __init__(self, shots):
        self.shots = iter(shots)

    def screenshot(self, **kw):
        return next(self.shots)


def test_a_settled_page_is_shot_once():
    assert settled_shot(Page([b"A", b"png1", b"A"])) == b"png1"


def test_a_page_mid_redraw_is_shot_again():
    assert settled_shot(Page([b"A", b"png1", b"B", b"B", b"png2", b"B"])) == b"png2"


def test_a_page_that_never_settles_keeps_its_last_shot():
    assert settled_shot(Page([b"1", b"p1", b"2", b"3", b"p2", b"4", b"5", b"p3", b"6"])) == b"p3"
