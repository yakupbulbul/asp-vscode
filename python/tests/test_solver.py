from pathlib import Path

import asp_studio as asp


def test_all_models():
    r = asp.solve("{a;b}.\n:- a, b.")
    assert r.ok and r.result == "SATISFIABLE"
    assert sorted(map(sorted, r)) == [[], ["a"], ["b"]]


def test_show_directive_is_respected():
    r = asp.solve("p(1..3).\nq(X) :- p(X).\n#show q/1.")
    assert r[0] == ["q(1)", "q(2)", "q(3)"]


def test_model_limit_sets_more():
    r = asp.solve("{a;b;c}.", models=2)
    assert len(r) == 2 and r.more
    assert not asp.solve("{a}.", models=5).more


def test_unsatisfiable():
    r = asp.solve("a.\n:- a.")
    assert r.ok and r.result == "UNSATISFIABLE" and len(r) == 0 and not r.satisfiable


def test_syntax_error_has_position():
    r = asp.solve("ok.\nb :- c(.")
    assert not r.ok
    d = r.diagnostics[0]
    assert (d.severity, d.line, d.col) == ("error", 2, 8)


def test_info_diagnostic_does_not_fail():
    r = asp.solve("a.\nb :- c.")
    assert r.ok
    assert any(d.severity == "info" and d.line == 2 for d in r.diagnostics)


def test_unsafe_variable_is_an_error():
    r = asp.solve("p(X) :- q.")
    assert not r.ok and any(d.severity == "error" for d in r.diagnostics)


def test_timeout():
    r = asp.solve("{ a(1..300) }.", timeout=0.5)
    assert r.timed_out and "Timeout" in r.error


def test_optimisation_keeps_only_optimal_models():
    prog = "{a;b}.\n#minimize { 1,a : a; 2,b : b }.\n:- not a, not b."
    for opt in ("", "--opt-mode=optN"):
        r = asp.solve(prog, options=opt)
        assert r.result == "OPTIMUM FOUND" and r.models == [["a"]] and r.costs == [[1]]


def test_options_and_constants():
    r = asp.solve("#const n = 2.\np(1..n).", options=["-c", "n=4"])
    assert len(r[0]) == 4


def test_files_and_lists(tmp_path: Path):
    f = tmp_path / "facts.lp"
    f.write_text("edge(a,b).")
    r = asp.solve([f, "reach(X,Y) :- edge(X,Y)."])
    assert sorted(r[0]) == ["edge(a,b)", "reach(a,b)"]


def test_invalid_option_is_reported_not_raised():
    r = asp.solve("a.", options="--definitely-not-an-option")
    assert not r.ok


def test_to_state_shape():
    s = asp.solve("{a}.").to_state()
    assert s["engine"] == "python" and s["totalModels"] == 2 and s["models"][0].keys() == {"atoms", "costs"}
    assert "error" not in s
    assert asp.solve("b :- c(.").to_state()["error"]
