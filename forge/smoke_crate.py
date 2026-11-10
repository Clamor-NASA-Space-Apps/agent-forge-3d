# Smoke test for the forge: a bevelled supply crate with a lid band and two handles.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import bevel, box, cyl, finish, mat, reset, smooth  # noqa: E402

reset()
body = bevel(box("body", (1.2, 0.8, 0.7), (0, 0, 0.35), mat("body")))
bevel(box("band", (1.22, 0.82, 0.12), (0, 0, 0.55), mat("accent")))
for x in (-0.63, 0.63):
    smooth(cyl(f"handle_{x}", 0.04, 0.35, (x, 0, 0.42), mat("metal"), 16, rot=(1.5708, 0, 0)))
smooth(body)
finish("smoke_crate")
