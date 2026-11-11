extends Node3D
## Style variants in the renderer the game ships with: forge renders can't show game lights (lamps, fire)
## or the engine's final colour. Paths must be absolute: Godot runs from the project folder.
##
##   godot --path godot/preview -- --design=$PWD/out/a.json,$PWD/out/b.json --glb=$PWD/out/a/building_probe.glb,$PWD/out/a/vehicle_probe.glb --lamps=2
##   node tools/capture-view.mjs godot/preview shots --views three,low -- --design=$PWD/out/a.json --glb=...
##
## design: token files from tools/design-tokens.mjs, one per variant. Keys 1 to 9 switch variant, drag to
## orbit, wheel to zoom. glb: models in a row, like forge/lineup.py, beside a person of `geometry.human`.
## lamps: count of `lighting.lamp` lights over the row. One swatch sphere per material role sits in
## front, so roles no model uses (fur, skin) are seen too.
## backdrop: models placed as they are, outside the row (terrain, far hills), so fog and sky are judged
## at distance; it replaces the flat ground.

var designs: Array[Dictionary] = []
var names: PackedStringArray = []
var current := 0
var models: Array[Node3D] = []
var backdrops: Array[Node3D] = []
var extras: Array[Node] = []
var width := 1.0
var centre := Vector3.ZERO
var view := "three"
var orbit := Vector2(-0.4, 0.35)
var zoom := 1.0


func _ready() -> void:
	var opt := {}
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		opt[kv[0]] = kv[1] if kv.size() > 1 else ""
	for f: String in str(opt.get("design", "")).split(",", false):
		designs.append(Forge.HouseStyle.load_design(f))
		names.append(f.get_file())
	assert(designs.size() > 0, "pass -- --design=<tokens.json>[,more.json]")
	var x := 0.0
	for f: String in str(opt.get("glb", "")).split(",", false):
		var m := Forge.load_glb(f)
		if m == null:
			continue
		add_child(m)
		var box := _bounds(m)
		m.position.x = x - box.position.x
		x += box.size.x + 0.8
		models.append(m)
	width = x + 0.6
	for f: String in str(opt.get("backdrop", "")).split(",", false):
		var b := Forge.load_glb(f)
		if b:
			add_child(b)
			backdrops.append(b)
	if backdrops:
		$Camera3D.far = 20000.0
	centre = Vector3(width / 2, 0.8, 0.6)
	_show(0, int(opt.get("lamps", "0")))
	Forge.register(self)


func _bounds(root: Node3D) -> AABB:
	var box := AABB()
	var first := true
	for mi: MeshInstance3D in root.find_children("*", "MeshInstance3D", true, false):
		var b := mi.global_transform * mi.get_aabb()
		box = b if first else box.merge(b)
		first = false
	return box


func _mesh(mesh: PrimitiveMesh, material: Material, at: Vector3) -> void:
	mesh.material = material
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.position = at
	add_child(mi)
	extras.append(mi)


func _show(i: int, lamps: int = -1) -> void:
	current = clampi(i, 0, designs.size() - 1)
	var design := designs[current]
	var lamp_count := lamps if lamps >= 0 else extras.filter(func(n: Node) -> bool: return n is OmniLight3D).size()
	for n in extras:
		n.queue_free()
	extras.clear()
	Forge.HouseStyle.apply_lighting(self, design)
	for m in models:
		Forge.HouseStyle.apply(m, design)
	for b in backdrops:
		Forge.HouseStyle.apply(b, design, true)
	var ground := StandardMaterial3D.new()
	ground.albedo_color = Color.html(design.lighting.get("ground", "#777777"))
	ground.roughness = 0.9
	var plane := PlaneMesh.new()
	plane.size = Vector2(60, 60)
	if backdrops.is_empty():
		_mesh(plane, ground, Vector3.ZERO)
	# the person is plain grey: a scale reference, not a model
	var h: float = design.get("geometry", {}).get("human", 1.8)
	var grey := StandardMaterial3D.new()
	grey.albedo_color = Color(0.6, 0.6, 0.6)
	var person := CapsuleMesh.new()
	person.radius = 0.22
	person.height = h
	_mesh(person, grey, Vector3(width - 0.3, h / 2, 0))
	var roles: Array = design.materials.keys()
	for r in roles.size():
		var ball := SphereMesh.new()
		ball.radius = 0.28
		ball.height = 0.56
		_mesh(ball, Forge.HouseStyle.role(design, roles[r]), Vector3((r + 0.5) * width / roles.size(), 0.28, 2.2))
	for l in lamp_count:
		var lamp := Forge.HouseStyle.make_lamp(design)
		if lamp == null:
			break
		lamp.position = Vector3((l + 0.5) * width / lamp_count, 3, 1.2)
		add_child(lamp)
		extras.append(lamp)
	$Label.text = "%d/%d  %s" % [current + 1, designs.size(), names[current]]
	set_view(view)


func set_view(v: String) -> void:
	var presets := {
		"three": Vector3(centre.x - width * 0.45, width * 0.45, width * 1.15),
		"front": Vector3(centre.x, 1.4, width * 1.1),
		"low": Vector3(centre.x - width * 0.3, 0.3, 4),
	}
	# eye: standing behind the row at head height, looking level down -Z, where a backdrop puts its horizon
	presets["eye"] = Vector3(centre.x, 1.6, width * 0.9 + 4)
	view = v if presets.has(v) else "three"
	var at := centre + Vector3(0, 0.8, -1000) if view == "eye" else centre
	$Camera3D.look_at_from_position(presets[view], at)


func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventKey and e.pressed and e.keycode >= KEY_1 and e.keycode <= KEY_9:
		_show(e.keycode - KEY_1)
	elif e is InputEventMouseMotion and e.button_mask & MOUSE_BUTTON_MASK_LEFT:
		orbit += Vector2(-e.relative.x, e.relative.y) * 0.006
		orbit.y = clampf(orbit.y, 0.03, 1.5)
		_orbit()
	elif e is InputEventMouseButton and e.pressed and e.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
		zoom = clampf(zoom * (0.9 if e.button_index == MOUSE_BUTTON_WHEEL_UP else 1.1), 0.2, 4.0)
		_orbit()


func _orbit() -> void:
	var r := width * 1.3 * zoom
	var at := centre + Vector3(sin(orbit.x) * cos(orbit.y), sin(orbit.y), cos(orbit.x) * cos(orbit.y)) * r
	$Camera3D.look_at_from_position(at, centre)


func render_game_to_text() -> Dictionary:
	return {"view": view, "variant": names[current], "roles": designs[current].materials.keys(),
		"lamps": extras.filter(func(n: Node) -> bool: return n is OmniLight3D).size()}
