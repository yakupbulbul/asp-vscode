from asp_studio.__main__ import main


def test_cli_writes_report(tmp_path, capsys):
    lp = tmp_path / "p.lp"
    lp.write_text("a :- not b.\nb :- not a.\n")
    assert main([str(lp)]) == 0
    out = (tmp_path / "p.html").read_text()
    assert "<!DOCTYPE html>" in out and "SATISFIABLE" in capsys.readouterr().out


def test_cli_error_exit_code(tmp_path):
    lp = tmp_path / "bad.lp"
    lp.write_text("b :- c(.")
    assert main([str(lp), "--out", str(tmp_path / "o.html")]) == 1


def test_cli_missing_file(tmp_path):
    assert main([str(tmp_path / "nope.lp")]) == 2
