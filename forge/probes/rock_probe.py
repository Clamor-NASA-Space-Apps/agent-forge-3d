# Style probe: a natural shape, to show how the style treats terrain (noise, roughness, shading).
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib import finish, mat, reset, smooth, sphere  # noqa: E402

random.seed(7)  # same rock in every variant, so only the style changes
reset()
for i, (x, y, r) in enumerate([(0, 0, 0.9), (1.1, 0.4, 0.5), (-0.9, -0.3, 0.4)]):
    rock = sphere(f"rock_{i}", r, (x, y, r * 0.5), mat("rock"), 12)
    for v in rock.data.vertices:
        v.co *= 0.8 + 0.35 * random.random()
        v.co.z *= 0.7
    smooth(rock)
finish("rock_probe")
