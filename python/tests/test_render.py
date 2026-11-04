import json
import re

import asp_studio as asp
from asp_studio.render import iframe, page


def _init(doc: str):
    m = re.search(r"window.__ASP_INIT__ = (.*?);</script>", doc, re.S)
    return json.loads(m.group(1).replace("<\\/", "</").replace("<\\!--", "<!--"))


def test_page_is_self_contained():
    doc = page(asp.solve("a :- not b. b :- not a."))
    assert doc.startswith("<!DOCTYPE html>")
    assert "<link" not in doc and "src=" not in doc
    for marker in ("AspEngine", "acquireVsCodeApi", "--vscode-foreground"):
        assert marker in doc


def test_state_round_trips():
    r = asp.solve("a.\nb :- a.")
    init = _init(page(r, tab="graph", theme="dark"))
    assert init["tab"] == "graph" and init["theme"] == "dark"
    assert init["program"] == r.program
    assert init["state"]["totalModels"] == 1


def test_script_end_tags_in_program_cannot_break_out():
    r = asp.solve('s("</script><script>alert(1)</script>").')
    doc = page(r)
    assert doc.count("</script>") == 4          # exactly our own four script elements
    assert _init(doc)["program"] == r.program


def test_iframe_wraps_page_in_srcdoc():
    html = iframe(asp.solve("a."), height=300)
    assert html.startswith("<iframe") and 'srcdoc="' in html and "height:300px" in html
    assert "<script" not in html.split('srcdoc="')[0]
    assert "&lt;!DOCTYPE html&gt;" in html


def test_result_has_notebook_repr():
    assert asp.solve("a.")._repr_html_().startswith("<iframe")
