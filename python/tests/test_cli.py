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


def test_cli_option_value_may_start_with_dashes(tmp_path):
    lp = tmp_path / "p.lp"
    lp.write_text("{a}.\n#minimize { 1,a : a }.\n")
    assert main([str(lp), "-o", "--opt-mode=optN", "-n", "1"]) == 0
    assert main([str(lp), "--options", "--opt-mode=optN"]) == 0
    assert main([str(lp), "-o", "--opt-mode=optN -c n=2"]) == 0


def test_cli_version(capsys):
    import pytest
    with pytest.raises(SystemExit) as e:
        main(["--version"])
    assert e.value.code == 0
    assert "asp-studio" in capsys.readouterr().out


def test_cli_reads_standard_input(tmp_path, monkeypatch, capsys):
    import io
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("sys.stdin", io.StringIO("a :- not b.\nb :- not a.\n"))
    assert main(["-"]) == 0
    assert (tmp_path / "asp-studio.html").exists()
    assert "2 model" in capsys.readouterr().out


def test_cli_reports_errors_in_stdin_by_name(monkeypatch, tmp_path, capsys):
    import io
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("sys.stdin", io.StringIO("b :- c(.\n"))
    assert main(["-"]) == 1
    assert "stdin:1:" in capsys.readouterr().err


def test_cli_out_may_be_a_directory(tmp_path):
    lp = tmp_path / "p.lp"
    lp.write_text("a.")
    out = tmp_path / "reports"
    out.mkdir()
    assert main([str(lp), "--out", str(out)]) == 0
    assert (out / "p.html").exists()
