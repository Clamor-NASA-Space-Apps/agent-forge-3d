# Every model in OUT side by side next to a 1.8 m person, under the DESIGN.md light rig:
# one picture that shows whether models made by different agents look like one game.
#
#   blender -b -P forge/lineup.py                      # -> previews/lineup.png
#   FORGE_PROBES=1 FORGE_DESIGN=variant.md FORGE_OUT=v/out FORGE_PREVIEWS=v blender -b -P forge/lineup.py
#       builds the style probes with that design first (how style variants are compared)
#   blender -b -P forge/lineup.py -- cat=0.3 dog=0.55  # sizes those models first: downloads come in their own units
# Skipped: `terrain_*` and any class whose height budget tops 100 m. A backdrop kilometres high in the
# same row shrinks every model beside it to a dot.
import glob
import os
import runpy
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import lib  # noqa: E402

if os.environ.get("FORGE_PROBES"):
    os.environ["FORGE_NO_RENDER"] = "1"
    for probe in sorted(glob.glob(os.path.join(lib.ROOT, "forge", "probes", "*.py"))):
        runpy.run_path(probe, run_name="__main__")

want = dict(a.split("=") for a in sys.argv[sys.argv.index("--") + 1:]) if "--" in sys.argv else {}
WIDE = 25.0  # metres of models in one picture: a longer row is a strip nobody can judge
BUDGETS = lib.DESIGN.get("geometry", {}).get("budgets", {})
pages = []


def shoot(x, depth):
    """Finish a row with the scale reference and the ground, and take its picture."""
    # the scale reference is not a model, so it gets a plain grey outside the palette
    human = lib.DESIGN.get("geometry", {}).get("human", 1.8)
    grey = lib._new_mat("lineup_person", (0.18, 0.18, 0.18), 0.9)
    lib.cyl("person_body", 0.22, human - 0.4, (x + 0.3, 0, (human - 0.4) / 2), grey, 16)
    lib.sphere("person_head", 0.18, (x + 0.3, 0, human - 0.2), grey, 16)
    ground_hex = lib.DESIGN.get("lighting", {}).get("ground", "#6f6a64")
    lib.box("ground", (x + 2, depth + 2, 0.02), (x / 2, 0, -0.01), lib._new_mat("lineup_ground", lib.linear(ground_hex), 1.0))
    pages.extend(lib.render_views(f"lineup_{len(pages) + 1}" if pages else "lineup", {"": (0.1, -1, 0.3)}, 1600, 640, 1.7))


lib.reset()
x, depth = 0.0, 2.0
for glb in sorted(glob.glob(os.path.join(lib.OUT, "*.glb"))):
    cls = os.path.basename(glb).split("_")[0]  # the class prefix, as style-check reads it
    if cls == "terrain" or BUDGETS.get(cls, {}).get("height", [0, 0])[-1] > 100:
        print("lineup: skipped", os.path.basename(glb), "(landscape scale)")
        continue
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb)
    new = [o for o in bpy.data.objects if o not in before]
    def corners():
        bpy.context.view_layer.update()
        return [o.matrix_world @ Vector(c) for o in new if o.type == "MESH" for c in o.bound_box]

    pts = corners()
    tall = want.get(os.path.splitext(os.path.basename(glb))[0])
    if tall and pts:
        k = float(tall) / (max(p.z for p in pts) - min(p.z for p in pts))
        for o in (o for o in new if o.parent is None):
            o.scale *= k
            o.location *= k
        pts = corners()
    if not pts:
        continue  # a GLB with no mesh (camera, empty) has nothing to line up
    depth = max(depth, max(abs(p.y) for p in pts) * 2)
    lo_x, hi_x = min(p.x for p in pts), max(p.x for p in pts)
    for o in new:
        if o.parent is None:
            o.location.x += x - lo_x
    x += hi_x - lo_x + 0.8
    if x > WIDE:  # this row is full: the next model starts a new picture (lineup_2.png, ...)
        shoot(x, depth)
        lib.reset()
        x, depth = 0.0, 2.0

if x > 0.0 or not pages:
    shoot(x, depth)
print("FORGE_DONE", *pages)
