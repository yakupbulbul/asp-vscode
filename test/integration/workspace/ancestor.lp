% parent(X,Y): X is a parent of Y
parent(anna,bob).
parent(bob,carl). parent(bob,dana).
parent(carl,eve).

ancestor(X,Y) :- parent(X,Y).
ancestor(X,Z) :- parent(X,Y), ancestor(Y,Z).
