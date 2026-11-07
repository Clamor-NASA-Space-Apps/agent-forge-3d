# Smoke test for the forge: a bevelled supply crate with a lid band and two handles.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import bevel, box, cyl, finish, mat, reset, smooth  # noqa: E402

reset()
shell = mat("shell", (0.86, 0.86, 0.82), rough=0.55)
band = mat("band", (0.95, 0.42, 0.10), rough=0.4)
metal = mat("metal", (0.55, 0.57, 0.6), rough=0.3, metal=1.0)

body = bevel(box("body", (1.2, 0.8, 0.7), (0, 0, 0.35), shell), 0.04)
bevel(box("band", (1.22, 0.82, 0.12), (0, 0, 0.55), band), 0.02)
for x in (-0.63, 0.63):
    smooth(cyl(f"handle_{x}", 0.04, 0.35, (x, 0, 0.42), metal, 16, rot=(1.5708, 0, 0)))
smooth(body)
finish("smoke_crate")
