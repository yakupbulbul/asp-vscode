"""Small helper shared by the command line and the %%asp magic."""
from __future__ import annotations

from typing import List, Sequence

# Flags of both parsers. A value that looks like one of these is never taken as the argument of -o.
_KNOWN = {"-n", "--models", "-t", "--timeout", "--out", "--tab", "--theme", "--height", "--open", "--version", "-h", "--help", "-o", "--options"}


def join_option_values(argv: Sequence[str]) -> List[str]:
    """Let ``-o --opt-mode=optN`` work: argparse refuses a value that starts with a dash.

    ``-o VALUE`` and ``--options VALUE`` become ``--options=VALUE`` unless VALUE is one of our own flags.
    """
    out: List[str] = []
    i = 0
    while i < len(argv):
        a = argv[i]
        nxt = argv[i + 1] if i + 1 < len(argv) else None
        if a in ("-o", "--options") and nxt is not None and nxt.startswith("-") and nxt.split("=", 1)[0] not in _KNOWN:
            out.append("--options=" + nxt)
            i += 2
            continue
        out.append(a)
        i += 1
    return out
