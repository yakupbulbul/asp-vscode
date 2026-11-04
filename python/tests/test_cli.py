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


def test_cli_rejects_bad_numbers(tmp_path, capsys):
    lp = tmp_path / "p.lp"
    lp.write_text("a.")
    assert main([str(lp), "-n", "-1"]) == 2
    assert main([str(lp), "-t", "0"]) == 2
    assert "must be" in capsys.readouterr().err


def test_cli_directory_and_binary_input(tmp_path, capsys):
    (tmp_path / "d.lp").mkdir()
    assert main([str(tmp_path / "d.lp")]) == 2
    assert "is a directory" in capsys.readouterr().err
    bad = tmp_path / "bin.lp"
    bad.write_bytes(b"\xff\xfe nonsense")
    assert main([str(bad)]) == 2
    assert "not UTF-8" in capsys.readouterr().err


def test_cli_creates_output_directory_and_names_the_failing_file(tmp_path, capsys):
    good, bad = tmp_path / "instance.lp", tmp_path / "encoding.lp"
    good.write_text("a.\n")
    bad.write_text("ok.\nb :- c(.\n")
    out = tmp_path / "new" / "dir" / "r.html"
    assert main([str(good), str(bad), "--out", str(out)]) == 1
    assert out.exists()
    assert "encoding.lp:2:8: error" in capsys.readouterr().err


def test_cli_unwritable_output(tmp_path, capsys):
    lp = tmp_path / "p.lp"
    lp.write_text("a.")
    blocker = tmp_path / "file"
    blocker.write_text("x")
    assert main([str(lp), "--out", str(blocker / "o.html")]) == 1
    assert "cannot write" in capsys.readouterr().err
