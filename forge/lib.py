"""Asset forge helpers for headless Blender (tested on Blender 5.2 LTS).

A recipe is a short Python file that imports this module, builds one model, and calls finish():

    import sys, os; sys.path.insert(0, os.path.dirname(__file__))
    from lib import *
    reset()
    body = box("body", size=(1, 1, 1), mat=mat("hull", (0.9, 0.9, 0.88)))
    bevel(body, 0.04)
    finish("crate")      # -> out/crate.glb + previews/crate_{front,side,top}.png

Run:  blender -b -P forge/<recipe>.py
Env:  FORGE_OUT (default: <tooling>/out), FORGE_PREVIEWS (default: <tooling>/previews),
      FORGE_NO_RENDER=1 skips the preview renders.
"""
import math
import os

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get("FORGE_OUT", os.path.join(ROOT, "out"))
PREVIEWS = os.environ.get("FORGE_PREVIEWS", os.path.join(ROOT, "previews"))
_mats = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()


def mat(name, rgb, rough=0.6, metal=0.0, emit=0.0):
    """One shared material per name, so a model's parts reuse materials (fewer draw calls in three.js)."""
    if name in _mats:
        return _mats[name]
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
    bpy.ops.object.transform_apply(scale=True)
    return _place(o, name, loc, mat)


def cyl(name, r=0.5, h=1, loc=(0, 0, 0), mat=None, verts=32, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, rotation=rot)
    return _place(bpy.context.object, name, loc, mat)


def sphere(name, r=0.5, loc=(0, 0, 0), mat=None, segs=32):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=segs, ring_count=segs // 2)
    return _place(bpy.context.object, name, loc, mat)


def bevel(obj, width=0.03, segments=3, angle_deg=30):
    """Bevelled edges catch light: the single biggest 'looks produced' upgrade over raw primitives."""
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
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle_deg))
    obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL").keep_sharp = True
    obj.select_set(False)
    return obj


def _meshes():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def _bounds():
    pts = [o.matrix_world @ Vector(c) for o in _meshes() for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def ground_origin():
    """Shift everything so the model sits on z=0, centred on x/y (three.js places it on the ground)."""
    lo, hi = _bounds()
    shift = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    for o in _meshes():
        if o.parent is None:
            o.location -= shift


def export_glb(name):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_apply=True, use_selection=False)
    return path


def render_previews(name, size=512):
    """Three fixed views (front, side, top) so an agent can check its work from pictures."""
    os.makedirs(PREVIEWS, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"          # ponytail: CPU Cycles works headless with no GPU; EEVEE needs a display
    sc.cycles.device, sc.cycles.samples = "CPU", 24
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.film_transparent = False
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.42, 0.44, 0.48, 1)
    sc.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 1.6
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    sc.collection.objects.link(sun)
    lo, hi = _bounds()
    c = (lo + hi) / 2
    r = max((hi - lo).length, 0.01)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 50
    sc.collection.objects.link(cam)
    sc.camera = cam
    views = {"front": Vector((0.35, -1, 0.45)), "side": Vector((1, 0.25, 0.4)), "top": Vector((0.001, -0.001, 1))}
    paths = []
    for view, d in views.items():
        cam.location = c + d.normalized() * r * 1.6
        cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = os.path.join(PREVIEWS, f"{name}_{view}.png")
        bpy.ops.render.render(write_still=True)
        paths.append(sc.render.filepath)
    return paths


def finish(name, render=None):
    ground_origin()
    glb = export_glb(name)
    shots = [] if (render is False or os.environ.get("FORGE_NO_RENDER")) else render_previews(name)
    print("FORGE_DONE", glb, *shots)
