# Style probe: a small wheeled vehicle (body, cabin, glass, wheels, lights).
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib import bevel, box, cyl, finish, mat, reset, smooth, sphere  # noqa: E402

reset()
smooth(bevel(box("chassis", (2.4, 1.4, 0.6), (0, 0, 0.75), mat("body"))))
smooth(bevel(box("cabin", (1.0, 1.2, 0.6), (-0.3, 0, 1.35), mat("trim"))))
bevel(box("windscreen", (0.06, 1.0, 0.4), (0.22, 0, 1.38), mat("glass")))
bevel(box("stripe", (2.42, 1.42, 0.12), (0, 0, 0.9), mat("accent")))
for x in (-0.8, 0.8):
    for y in (-0.75, 0.75):
        smooth(bevel(cyl(f"wheel_{x}_{y}", 0.38, 0.25, (x, y, 0.38), mat("metal"), 24, rot=(1.5708, 0, 0))))
for y in (-0.45, 0.45):
    smooth(sphere(f"headlight_{y}", 0.09, (1.21, y, 0.85), mat("light"), 16))
finish("vehicle_probe")
