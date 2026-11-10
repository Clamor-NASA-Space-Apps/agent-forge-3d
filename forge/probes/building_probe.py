# Style probe: a small building module with a 2.0 m door, so a style can be judged at human scale.
# Probes read only material roles, so the same shapes render in any DESIGN.md (see forge/lineup.py).
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib import bevel, box, cyl, finish, mat, reset, smooth, sphere  # noqa: E402

reset()
smooth(bevel(box("shell", (4, 3, 2.6), (0, 0, 1.3), mat("body"))))
bevel(box("band", (4.04, 3.04, 0.3), (0, 0, 2.2), mat("accent")))
bevel(box("door", (0.08, 1.0, 2.0), (2.0, 0, 1.0), mat("trim")))
bevel(box("window", (0.08, 1.0, 0.6), (-2.0, 0, 1.5), mat("glass")))
smooth(cyl("vent", 0.3, 0.5, (-1.0, 0.6, 2.85), mat("metal"), 24))
smooth(sphere("lamp", 0.1, (2.08, 0, 2.15), mat("light"), 16))
finish("building_probe")
