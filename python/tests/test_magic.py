import pytest

IPython = pytest.importorskip("IPython")
from IPython.core.interactiveshell import InteractiveShell
from IPython.utils.capture import capture_output


@pytest.fixture()
def ip():
    shell = InteractiveShell.instance()
    shell.run_line_magic("load_ext", "asp_studio")
    return shell


def test_cell_magic_displays_visualizer_and_stores_result(ip):
    with capture_output() as cap:
        ip.run_cell_magic("asp", "--out res --tab answers", "{a;b}.\n:- a, b.")
    assert "<iframe" in cap.outputs[0].data["text/html"]
    assert len(ip.user_ns["res"]) == 3


def test_cell_magic_reports_errors_inside_the_visualizer(ip):
    with capture_output() as cap:
        ip.run_cell_magic("asp", "--out bad", "b :- c(.")
    assert "<iframe" in cap.outputs[0].data["text/html"]
    assert not ip.user_ns["bad"].ok


def test_bad_arguments_print_usage(ip, capsys):
    ip.run_cell_magic("asp", "--no-such-flag", "a.")
    assert "%%asp" in capsys.readouterr().out


def test_magic_option_value_may_start_with_dashes(ip):
    with capture_output() as cap:
        ip.run_cell_magic("asp", '-o "--opt-mode=optN" --out opt', "{a}.\n#minimize { 1,a : a }.")
    assert "<iframe" in cap.outputs[0].data["text/html"]
    assert ip.user_ns["opt"].ok
