shader_type spatial;
// DESIGN.md `geometry.shading: flat`: one normal per triangle, taken from the surface itself,
// so kit models and built-in meshes facet without re-importing them.
uniform vec4 albedo : source_color = vec4(1.0);
uniform float roughness = 0.6;
uniform float metallic = 0.0;
uniform vec3 emission : source_color = vec3(0.0);

void fragment() {
	ALBEDO = albedo.rgb;
	ROUGHNESS = roughness;
	METALLIC = metallic;
	EMISSION = emission;
	NORMAL = normalize(cross(dFdy(VERTEX), dFdx(VERTEX)));
}
