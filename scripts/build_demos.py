#!/usr/bin/env python3
"""Generate the interactive demo pages of the website (docs/demo/*.html) with the real visualizer.
Needs the Python package: pip install -e python    Run: python scripts/build_demos.py"""
from pathlib import Path

import asp_studio as asp

OUT = Path(__file__).resolve().parents[1] / "docs" / "demo"

DEMOS = {
    "ancestors": ("ancestors.lp", "animator", """% parent(X,Y): X is a parent of Y
parent(anna,bob).
parent(bob,carl). parent(bob,dana).
parent(carl,eve).

ancestor(X,Y) :- parent(X,Y).
ancestor(X,Z) :- parent(X,Y), ancestor(Y,Z).
"""),
    "coloring": ("coloring.lp", "answers", """color(red;green;blue).
node(1..4).
edge(1,2). edge(2,3). edge(1,3). edge(3,4).

{ c(N,C) : color(C) } = 1 :- node(N).    % every node gets one color
:- edge(A,B), c(A,C), c(B,C).             % neighbours differ

#show c/2.
"""),
    "knapsack": ("knapsack.lp", "answers", """item(a;b;c;d).
weight(a,3). weight(b,5). weight(c,2). weight(d,4).
value(a,4).  value(b,7). value(c,2). value(d,5).

{ take(I) : item(I) }.
:- #sum { W,I : take(I), weight(I,W) } > 9.   % the bag holds 9
#maximize { V,I : take(I), value(I,V) }.

#show take/1.
"""),
}

OUT.mkdir(parents=True, exist_ok=True)
for name, (title, tab, program) in DEMOS.items():
    res = asp.solve(program)
    assert res.ok, (name, res.error)
    (OUT / f"{name}.html").write_text(asp.page(res, tab=tab, max_height=640, title=title), encoding="utf-8")
    print(f"{name}: {res.result}, {len(res)} model(s)")
