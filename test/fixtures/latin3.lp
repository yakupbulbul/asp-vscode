% 3x3 Latin square: every cell gets one value, no value repeats in a row or column.
n(1..3).
{ cell(R,C,V) : n(V) } = 1 :- n(R), n(C).
:- cell(R,C1,V), cell(R,C2,V), C1 < C2.
:- cell(R1,C,V), cell(R2,C,V), R1 < R2.
