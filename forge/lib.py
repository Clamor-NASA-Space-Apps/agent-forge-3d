"""Asset forge helpers for headless Blender (tested on Blender 5.2 LTS).

A recipe is a short Python file that imports this module, builds one model, and calls finish():

    import sys, os; sys.path.insert(0, os.path.dirname(__file__))
    from lib import *
    reset()
    body = bevel(box("body", size=(1, 1, 1), mat=mat("body")))
    finish("crate")      # -> out/crate.glb + previews/crate_{front,side,top}.png

Colours, roughness, bevel size, shading and the preview light rig all come from a DESIGN.md
(FORGE_DESIGN, default examples/DESIGN.md). A recipe names a material role; it never types a colour.

Run:  blender -b -P forge/<recipe>.py
Env:  FORGE_DESIGN, FORGE_OUT (default: <tooling>/out), FORGE_PREVIEWS (default: <tooling>/previews),
      FORGE_NO_RENDER=1 skips the preview renders.
"""
import json
import math
import os
import subprocess

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get("FORGE_OUT", os.path.join(ROOT, "out"))
PREVIEWS = os.environ.get("FORGE_PREVIEWS", os.path.join(ROOT, "previews"))
DESIGN_PATH = os.environ.get("FORGE_DESIGN", os.path.join(ROOT, "examples", "DESIGN.md"))
_mats = {}


def load_design(path):
    """Resolved DESIGN.md tokens from tools/design-tokens.mjs, so the forge and the browser share one parser."""
    script = os.path.join(ROOT, "tools", "design-tokens.mjs")
    r = subprocess.run(["node", script, path], capture_output=True, text=True)
    if r.returncode:
        msg = next((l for l in r.stderr.splitlines() if l.startswith("Error:")), f"design-tokens.mjs failed on {path}")
        raise ValueError(msg)
    return json.loads(r.stdout)


DESIGN = load_design(DESIGN_PATH)


def linear(hex_):
    """'#rrggbb' (sRGB, as written in DESIGN.md) -> linear RGB, which is what Blender and glTF store."""
    c = [int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()


def mat(name, *raw):
    """The DESIGN.md material role `name`, shared across parts (fewer draw calls in the game).

    Only roles from DESIGN.md exist. A raw colour is refused on purpose: it is how five agents end
    up with five styles. Need a new look? Add a role to DESIGN.md, with the user's approval.
    """
    if raw:
        raise TypeError(f"mat('{name}', ...) got a raw colour; pass only a DESIGN.md role name, e.g. mat('body')")
    if name in _mats:
        return _mats[name]
    t = DESIGN.get("materials", {}).get(name)
    if t is None:
        raise KeyError(f"material role '{name}' is not in {DESIGN_PATH}; add it there, never a raw colour")
    rgb, rough, metal, emit = linear(t["color"]), t.get("roughness", 0.6), t.get("metalness", 0), t.get("emissive", 0)
    return _new_mat(name, rgb, rough, metal, emit)


def _new_mat(name, rgb, rough=0.6, metal=0.0, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*rgb, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emit:
        p.inputs["Emission Color"].default_value = (*rgb, 1)
        p.inputs["Emission Strength"].default_value = emit
    _mats[name] = m
    return m


def _place(obj, name, loc, mat_):
    obj.name = name
    obj.location = loc
    if mat_:
        obj.data.materials.append(mat_)
    return obj


def box(name, size=(1, 1, 1), loc=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)  # location defaults to True and would bake the 3D cursor in
    return _place(o, name, loc, mat)


def cyl(name, r=0.5, h=1, loc=(0, 0, 0), mat=None, verts=32, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, rotation=rot)
    return _place(bpy.context.object, name, loc, mat)


def cone(name, r=0.5, h=1, loc=(0, 0, 0), mat=None, verts=32, rot=(0, 0, 0)):
    """A pointed cone standing on its base at loc (pines, flame shards, spikes)."""
    bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=0, depth=h, vertices=verts, rotation=rot)
    o = _place(bpy.context.object, name, loc, mat)
    o.location.z += h / 2
    return o


def sphere(name, r=0.5, loc=(0, 0, 0), mat=None, segs=32):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=segs, ring_count=segs // 2)
    return _place(bpy.context.object, name, loc, mat)


def bevel(obj, width=None, segments=None, angle_deg=30):
    """Bevelled edges catch light: the single biggest 'looks produced' upgrade over raw primitives.

    Default width is DESIGN.md geometry.bevel times the part's smallest side, so every model has the same edge feel.
    """
    g = DESIGN.get("geometry", {})
    if width is None:
        width = g.get("bevel", 0.05) * min(d for d in obj.dimensions if d > 0)
    segments = segments or g.get("bevelSegments", 3)
    m = obj.modifiers.new("Bevel", "BEVEL")
    m.width, m.segments, m.limit_method = width, segments, "ANGLE"
    m.angle_limit = math.radians(angle_deg)
    return obj


def array(obj, count, offset=(1.1, 0, 0)):
    m = obj.modifiers.new("Array", "ARRAY")
    m.count, m.use_relative_offset, m.relative_offset_displace = count, True, offset
    return obj


def mirror(obj, axis="X"):
    m = obj.modifiers.new("Mirror", "MIRROR")
    m.use_axis = [axis == "X", axis == "Y", axis == "Z"]
    return obj


def cut(obj, cutter):
    """Boolean difference; the cutter object is removed afterwards."""
    m = obj.modifiers.new("Cut", "BOOLEAN")
    m.operation, m.object = "DIFFERENCE", cutter
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter)
    return obj


def smooth(obj, angle_deg=30):
    """Smooth shading with weighted normals, unless DESIGN.md says `shading: flat` (faceted low-poly look)."""
    if DESIGN.get("geometry", {}).get("shading") == "flat":
        return obj
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle_deg))
    obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL").keep_sharp = True
    obj.select_set(False)
    return obj


def prism(name: str, profile: list, width: float, x: float = 0.0, mat=None):
    """A solid from a side profile [(y, z), ...] (counter-clockwise seen from +X), `width` across X:
    cabins, ramps, wedges, anything a box cannot cut."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    left = [bm.verts.new((x - width / 2, y, z)) for y, z in profile]
    right = [bm.verts.new((x + width / 2, y, z)) for y, z in profile]
    bm.faces.new(list(reversed(left)))
    bm.faces.new(right)
    for i in range(len(profile)):
        j = (i + 1) % len(profile)
        bm.faces.new((left[i], left[j], right[j], right[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if mat:
        o.data.materials.append(mat)
    return o


def bar(name: str, p0, p1, r: float, mat=None, verts: int = 8):
    """A round rod from p0 to p1: rails, posts, pipes, struts."""
    a, b = Vector(p0), Vector(p1)
    o = cyl(name, r, (b - a).length, (a + b) / 2, mat, verts)
    o.rotation_euler = (b - a).to_track_quat("Z", "Y").to_euler()
    return o


def label(name: str, text: str, size: float, loc, rot, mat, depth: float = 0.008, font: str | None = None, bold: float = 0.0):
    """Raised lettering as real geometry, so no texture can blur it. `font` is a .ttf/.otf path
    (Blender's built-in font when None); `bold` thickens strokes by that share of `size`."""
    cu = bpy.data.curves.new(name, "FONT")
    cu.body, cu.size, cu.extrude, cu.resolution_u, cu.offset = text, size, depth, 2, bold * size
    cu.align_x, cu.align_y = "CENTER", "CENTER"
    if font:
        cu.font = bpy.data.fonts.load(font, check_existing=True)
    o = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(o)
    o.location, o.rotation_euler = loc, rot
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.object
    o.data.materials.clear()
    o.data.materials.append(mat)
    o.select_set(False)
    return o


def join(name: str, parts: list):
    """Parts into one node, modifiers applied; the first part's origin stays. A game that moves or
    hides a piece by name needs it as one node."""
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
        bpy.context.view_layer.objects.active = p
        for m in list(p.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = o.data.name = name
    o.select_set(False)
    return o


def settle(o, origin):
    """Bake rotation and scale into the mesh and put the node's origin at `origin` (a hinge, a hub),
    so the engine turns the part about its own axes: a door on its hinge, a wheel on its axle."""
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.context.scene.cursor.location = origin
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = (0, 0, 0)
    o.select_set(False)
    return o


def tyre(name: str, r: float, w: float, at, tyre_mat, hub_mat, verts: int = 24, lugs: int = 0):
    """One wheel (axle along X) as one node with its origin on the hub. `lugs` adds tread blocks that
    reach the full radius `r` from a slightly smaller carcass."""
    t = bevel(cyl(name, r * (0.94 if lugs else 1), w, at, tyre_mat, verts, rot=(0, math.pi / 2, 0)), width=w * 0.15, segments=1)
    parts = [smooth(t), smooth(cyl(name + "_hub", r * 0.55, w * 1.04, at, hub_mat, 16, rot=(0, math.pi / 2, 0)))]
    for i in range(lugs):
        a = 2 * math.pi * i / lugs
        lug = box(name + f"_lug{i}", (w * 0.9, r * 0.12, r * 0.06),
                  (at[0], at[1] + math.cos(a) * r * 0.97, at[2] + math.sin(a) * r * 0.97), tyre_mat)
        lug.rotation_euler = (a - math.pi / 2, 0, 0)  # its thin side points out from the axle
        parts.append(lug)
    return settle(join(name, parts), at)


def _meshes():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def _bounds():
    bpy.context.view_layer.update()  # matrix_world is stale after a location change until the scene refreshes
    pts = [o.matrix_world @ Vector(c) for o in _meshes() for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def ground_origin():
    """Shift everything so the model sits on z=0, centred on x/y (the game places it on the ground)."""
    lo, hi = _bounds()
    shift = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    for o in _meshes():
        if o.parent is None:
            o.location -= shift


def export_glb(name):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".glb")
    # extras carry a part's custom properties (tags) into the game, where they arrive as get_meta("extras")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_apply=True, use_selection=False, export_extras=True)
    return path


def _stage():
    """The DESIGN.md light rig, so previews look like the game: sky colour, one sun, Cycles CPU."""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"          # ponytail: CPU Cycles works headless with no GPU; EEVEE needs a display
    sc.cycles.device, sc.cycles.samples = "CPU", 24
    sc.render.film_transparent = False
    L = DESIGN.get("lighting", {})
    if "lamp" in L:
        L = {}  # a look lit by game lamps is near black under its own sky; previews are for shape, so daylight
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (*linear(L.get("sky", "#a8adb5")), 1)
    bg.inputs[1].default_value = L.get("ambient", 1.0) * 0.5
    sc.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    # ponytail: engine and Cycles units differ; 0.6x is close enough to judge shape and colour
    sun.data.energy = L.get("sun", 2.5) * 0.6
    sun.data.color = linear(L.get("sunColor", "#ffffff"))
    sun.rotation_euler = (math.radians(90 - L.get("elevation", 40)), 0, math.radians(L.get("azimuth", 35)))
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 50
    sc.collection.objects.link(cam)
    sc.camera = cam
    return sc, cam


def render_views(name, views, w=512, h=512, dist=1.6):
    """One PNG per view direction, framing every mesh in the scene."""
    os.makedirs(PREVIEWS, exist_ok=True)
    sc, cam = _stage()
    sc.render.resolution_x, sc.render.resolution_y = w, h
    lo, hi = _bounds()
    c = (lo + hi) / 2
    r = max((hi - lo).length, 0.01)
    paths = []
    for view, d in views.items():
        cam.location = c + Vector(d).normalized() * r * dist
        cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = os.path.join(PREVIEWS, f"{name}_{view}.png" if view else f"{name}.png")
        bpy.ops.render.render(write_still=True)
        paths.append(sc.render.filepath)
    return paths


def render_previews(name, size=512):
    """Three fixed views (front, side, top) so an agent can check its work from pictures."""
    views = {"front": (0.35, -1, 0.45), "side": (1, 0.25, 0.4), "top": (0.001, -0.001, 1)}
    return render_views(name, views, size, size)


def finish(name, render=None):
    ground_origin()
    glb = export_glb(name)
    shots = [] if (render is False or os.environ.get("FORGE_NO_RENDER")) else render_previews(name)
    print("FORGE_DONE", glb, *shots)
