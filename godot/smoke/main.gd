extends Node3D
## Smoke test for the factory: the house style, the light rig, capture-view and feel-probe.
## It reads ../../out/design.json and ../../out/smoke_crate.glb (see "Checks before committing" in AGENTS.md).
## A quality preset is put on with a game argument: capture-view.mjs godot/smoke -- --quality=medium

const PRESETS := {"default": Vector3(2.2, 1.6, 2.2), "top": Vector3(0.01, 3.5, 0.01), "side": Vector3(3, 0.8, 0)}

var t := 0.0
var speed := 0.0
var walk := 0.0
var hero: MeshInstance3D
var crate: Node3D


func _ready() -> void:
	var out := ProjectSettings.globalize_path("res://").path_join("../../out")
	var design := Forge.HouseStyle.load_design(out.path_join("design.json"))
	Forge.HouseStyle.apply_lighting(self, design)
	var disc := CylinderMesh.new()
	disc.top_radius = 3.0
	disc.bottom_radius = 3.0
	disc.height = 0.02
	_part("ground", disc, "sandGround", Color("a0522d"), Vector3(0, -0.01, 0), design, true)
	# a stand-in for a kit model with an off-palette colour: house style must map it to the "metal" role
	_part("kitPart", _box(Vector3(0.3, 0.3, 0.3)), "steelPanel", Color("ff00ff"), Vector3(1, 0.15, 0.6), design)
	# a stand-in hero for feel-probe: W walks it along +z, easing up to the sheet's walking speed
	hero = _part("hero", _box(Vector3(0.2, 0.3, 0.4)), "steelPanel", Color.WHITE, Vector3(-1, 0.15, -1), design)
	crate = Forge.load_glb(out.path_join("smoke_crate.glb"))
	crate.name = "crate"
	add_child(Forge.HouseStyle.apply(crate, design))
	var sheet: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://reality.json"))
	for r: Dictionary in sheet.rows:
		if r.id == "hero.speed.walk":
			walk = r.value
	InputMap.add_action("move_forward")
	var key := InputEventKey.new()
	key.physical_keycode = KEY_W
	InputMap.action_add_event("move_forward", key)
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--quality="):
			Forge.HouseStyle.set_quality(self, design, a.trim_prefix("--quality="))
	set_view("default")
	Forge.register(self)


func _box(size: Vector3) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = size
	return b


## `still`: the part never moves, so its role may show its world-space detail.
func _part(part: String, mesh: PrimitiveMesh, material: String, color: Color, at: Vector3, design: Dictionary, still := false) -> MeshInstance3D:
	var m := StandardMaterial3D.new()
	m.resource_name = material
	m.albedo_color = color
	mesh.material = m
	var mi := MeshInstance3D.new()
	mi.name = part
	mi.mesh = mesh
	mi.position = at
	add_child(Forge.HouseStyle.apply(mi, design, still))
	return mi


func _physics_process(delta: float) -> void:
	t += delta
	crate.rotation.y = t
	var want := walk if Input.is_action_pressed("move_forward") else 0.0
	speed = move_toward(speed, want, walk * delta / 0.2)
	hero.position.z += speed * delta


func set_view(view: String) -> void:
	$Camera3D.look_at_from_position(PRESETS.get(view, PRESETS.default), Vector3(0, 0.3, 0))


func place(pos: Vector3, yaw_deg: float) -> void:
	hero.position = pos + Vector3(0, 0.15, 0)
	hero.rotation.y = deg_to_rad(yaw_deg)
	speed = 0.0


func render_game_to_text() -> Dictionary:
	var materials := {}
	for n in find_children("*", "MeshInstance3D", true, false):
		var m := (n as MeshInstance3D).get_active_material(0)
		materials[n.name] = "%s #%s" % [m.resource_name, (m as StandardMaterial3D).albedo_color.to_html(false) if m is StandardMaterial3D else "shader"]
	var view := get_viewport()
	return {"t": t, "objects": get_children().map(func(n: Node) -> String: return n.name), "materials": materials,
		"quality": {"msaa": view.msaa_3d, "scale": view.scaling_3d_scale},
		"player": {"pos": hero.position - Vector3(0, 0.15, 0)}}
