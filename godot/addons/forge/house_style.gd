extends RefCounted
## The DESIGN.md look in Godot. Every project uses this instead of writing its own, so models from the
## forge, from kits and from official sources end up in one style under one light rig.
##
##   var design := Forge.HouseStyle.load_design("res://design.json")   # node tools/design-tokens.mjs DESIGN.md design.json
##   Forge.HouseStyle.apply_lighting(self, design)
##   add_child(Forge.HouseStyle.apply(model, design))
##
## Materials are shared per role: duplicate one before changing it on a single object (hover, fade),
## or every model with that role changes too.

const FLAT := preload("flat.gdshader")
# DESIGN.md light values were tuned where a light of strength pi on a white surface gives white.
# Godot gets there at energy 1, so every strength is divided by pi to keep one file meaning one look.
const UNIT := 1.0 / PI


static func load_design(path: String) -> Dictionary:
	var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	assert(d is Dictionary, "%s is not a design token file (node tools/design-tokens.mjs DESIGN.md design.json)" % path)
	return d


## One shared material per role, kept inside the design so a second design gets its own set.
static func role(design: Dictionary, name: String) -> Material:
	var cache: Dictionary = design.get_or_add("_roles", {})
	if cache.has(name):
		return cache[name]
	var t: Dictionary = design.materials[name]
	var color := Color.html(t.color)
	var glow := float(t.get("emissive", 0))
	var m: Material
	if design.get("geometry", {}).get("shading", "smooth") == "flat":
		# forge models bake their normals, but kit models and built-in meshes only facet here
		var s := ShaderMaterial.new()
		s.shader = FLAT
		s.set_shader_parameter("albedo", color)
		s.set_shader_parameter("roughness", float(t.get("roughness", 0.6)))
		s.set_shader_parameter("metallic", float(t.get("metalness", 0)))
		s.set_shader_parameter("emission", color * glow)
		m = s
	else:
		var s := StandardMaterial3D.new()
		s.albedo_color = color
		s.roughness = float(t.get("roughness", 0.6))
		s.metallic = float(t.get("metalness", 0))
		if glow > 0:
			s.emission_enabled = true
			s.emission = color
			s.emission_energy_multiplier = glow
		m = s
	m.resource_name = name
	cache[name] = m
	return m


static func _pick(design: Dictionary, m: Material) -> Material:
	var n := m.resource_name if m else ""
	if design.materials.has(n):
		return role(design, n)
	for pattern: String in design.get("kit", {}):
		if pattern.begins_with("#"):
			continue # colour anchors belong to tools/kit-roles.mjs, not name matching
		if RegEx.create_from_string("(?i)" + pattern).search(n):
			return role(design, design.kit[pattern])
	var std := m as BaseMaterial3D
	if std and std.albedo_texture:
		push_warning("house-style: textured material \"%s\" kept as is; map it in DESIGN.md kit or retexture it" % n)
		return m
	# nearest colour in RGB: good enough to flag, the fix is a kit entry and not a better metric
	var c := std.albedo_color if std else Color(0.53, 0.53, 0.53)
	var best := ""
	var dist := INF
	for r: String in design.materials:
		if design.materials[r].get("emissive", 0):
			continue # a guessed match must never make a crate glow
		var k := Color.html(design.materials[r].color)
		var d := (k.r - c.r) ** 2 + (k.g - c.g) ** 2 + (k.b - c.b) ** 2
		if d < dist:
			best = r
			dist = d
	push_warning("house-style: material \"%s\" is not in DESIGN.md kit; using nearest role \"%s\"" % [n, best])
	return role(design, best)


## Every mesh under `root` gets the role materials. Returns root.
static func apply(root: Node, design: Dictionary) -> Node:
	var todo: Array[Node] = [root]
	while todo.size():
		var n: Node = todo.pop_back()
		todo.append_array(n.get_children())
		var mi := n as MeshInstance3D
		if mi == null or mi.mesh == null:
			continue
		for i in mi.mesh.get_surface_count():
			mi.set_surface_override_material(i, _pick(design, mi.get_active_material(i)))
	return root


## The one light rig: sky, ambient, sun, tone mapping and fog. Calling it again (a theme switch) replaces the old rig.
static func apply_lighting(parent: Node, design: Dictionary) -> Dictionary:
	var L: Dictionary = design.lighting
	for old in parent.get_children():
		if old.has_meta("house_rig"):
			parent.remove_child(old)
			old.queue_free()
	# a sky that is the sky colour above and the ground colour below gives metals something to reflect:
	# without it they render black
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color.html(L.sky)
	sky_mat.sky_horizon_color = Color.html(L.sky)
	sky_mat.ground_horizon_color = Color.html(L.get("ground", L.sky))
	sky_mat.ground_bottom_color = Color.html(L.get("ground", L.sky))
	sky_mat.sun_angle_max = 0.0
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = Sky.new()
	env.sky.sky_material = sky_mat
	# ambient is a colour and not the sky: measured on 4.7.2, sky ambient in the Compatibility renderer
	# ignores ambient_light_energy and lights everything at full sky brightness
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color.html(L.sky)
	env.ambient_light_energy = float(L.get("ambient", 1)) * UNIT
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = {
		"aces": Environment.TONE_MAPPER_ACES, "agx": Environment.TONE_MAPPER_AGX,
		"filmic": Environment.TONE_MAPPER_FILMIC, "reinhard": Environment.TONE_MAPPER_REINHARDT,
	}.get(L.get("toneMapping", ""), Environment.TONE_MAPPER_LINEAR)
	env.tonemap_exposure = float(L.get("exposure", 1))
	# at the engine's white of 1 a sunlit `body` wall is already at the top of the range (252 of 255, measured);
	# 6 leaves it at 222, with room for a highlight
	env.tonemap_white = 6.0
	if L.has("fog"):
		env.fog_enabled = true
		env.fog_mode = Environment.FOG_MODE_DEPTH
		env.fog_light_color = Color.html(L.fog.color)
		env.fog_depth_begin = float(L.fog.near)
		env.fog_depth_end = float(L.fog.far)
	var world := WorldEnvironment.new()
	world.environment = env
	var sun := DirectionalLight3D.new()
	sun.light_color = Color.html(L.get("sunColor", "#ffffff"))
	sun.light_energy = float(L.get("sun", 2.5)) * UNIT
	sun.shadow_enabled = true
	# same angles as the forge previews; Godot is Y-up, so azimuth turns around Y
	var phi := deg_to_rad(90.0 - float(L.get("elevation", 40)))
	var theta := deg_to_rad(float(L.get("azimuth", 35)))
	sun.position = Vector3(sin(phi) * sin(theta), cos(phi), sin(phi) * cos(theta)) * 50.0
	if RenderingServer.get_current_rendering_method() == "gl_compatibility":
		# The Compatibility renderer adds a shadowed light in sRGB space ("Note on Appearance Changes" in
		# the Lights and shadows docs), so sun plus ambient came out 2.2 times too bright on flat ground
		# (measured, 4.7.2). This is the sun energy that gives the intended sum there; shade stays ambient.
		var g := 1.0 / 2.2
		var a := env.ambient_light_energy * env.ambient_light_color.get_luminance()
		var s := sun.light_energy * sun.light_color.get_luminance() * cos(phi)
		if s > 0.0:
			sun.light_energy *= pow(pow(a + s, g) - pow(a, g), 1.0 / g) / s
	for n: Node in [world, sun]:
		n.set_meta("house_rig", true)
		parent.add_child(n)
	sun.look_at(Vector3.ZERO)
	return {"world": world, "sun": sun}


## A game light (streetlamp, window, fire) from DESIGN.md `lighting.lamp`, so a night scene's lamp
## pools stay in the design language too. The world data places it; null if the design has none.
static func make_lamp(design: Dictionary) -> OmniLight3D:
	var l: Variant = design.lighting.get("lamp")
	if l == null:
		return null
	var lamp := OmniLight3D.new()
	lamp.name = "lamp"
	lamp.light_color = Color.html(l.color)
	lamp.light_energy = float(l.get("intensity", 10)) * UNIT
	lamp.omni_range = float(l.get("distance", 10))
	return lamp
