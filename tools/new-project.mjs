// Starts a Godot game project wired to the factory, or refreshes the factory code inside one.
//
//   node tools/new-project.mjs <name | dir>          creates projects/<name>/ (or the given dir)
//   node tools/new-project.mjs <name | dir> --sync   re-copies godot/addons/forge into an existing project
//
// A project is its own git repo and must build without this one, so the Forge addon is copied in, never
// linked. Change the addon here and --sync; an edit made inside a project is lost at the next sync.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2), sync = args.includes('--sync'), name = args.find(a => !a.startsWith('--'));
if (!name) { console.error('usage: new-project.mjs <name | dir> [--sync]'); process.exit(2); }
const dir = /[\\/]/.test(name) ? path.resolve(name) : path.join(root, 'projects', name);
const has = fs.existsSync(path.join(dir, 'project.godot'));
if (sync !== has) { console.error(sync ? `${dir} has no project.godot to sync into` : `${dir} already has a project.godot (use --sync)`); process.exit(1); }

fs.rmSync(path.join(dir, 'addons/forge'), { recursive: true, force: true });
fs.cpSync(path.join(root, 'godot/addons/forge'), path.join(dir, 'addons/forge'), { recursive: true });
if (sync) { console.log(`synced addons/forge in ${dir}`); process.exit(0); }

const files = {
  // Compatibility is the only renderer a web export has, so the game is built and judged in it from day one.
  // A hand-written project gets Godot Physics unless it names Jolt, the default of projects made in the editor.
  // ETC2/ASTC textures are what phone GPUs read; without them a web build only carries desktop formats.
  'project.godot': `config_version=5

[application]

config/name="${path.basename(dir)}"
run/main_scene="res://main.tscn"
config/features=PackedStringArray("4.7", "GL Compatibility")

[autoload]

Forge="*res://addons/forge/forge.gd"

[display]

window/size/viewport_width=1280
window/size/viewport_height=720
window/stretch/mode="canvas_items"
window/stretch/aspect="expand"

[physics]

3d/physics_engine="Jolt Physics"

[rendering]

renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
textures/vram_compression/import_etc2_astc=true
`,
  // single-threaded and no extensions: the build that runs on any static host, in any browser
  'export_presets.cfg': `[preset.0]

name="Web"
platform="Web"
runnable=true
export_filter="all_resources"
include_filter="*.json"
exclude_filter="captures/*, build/*"
export_path="build/web/index.html"

[preset.0.options]

variant/extensions_support=false
variant/thread_support=false
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=true
`,
  'main.tscn': `[gd_scene format=3]

[ext_resource type="Script" path="res://main.gd" id="1"]

[node name="Main" type="Node3D"]
script = ExtResource("1")

[node name="Camera3D" type="Camera3D" parent="."]
`,
  'main.gd': `extends Node3D


func _ready() -> void:
	Forge.register(self)


# What the tools read in place of a screenshot. Keep it small and true.
func render_game_to_text() -> Dictionary:
	return {}


func set_view(_view: String) -> void:
	pass
`,
  '.gitignore': '.godot/\nbuild/\ncaptures/\n',
  // folders the workflow fills that are not game data: without this the engine imports every reference image and ships it
  'design/.gdignore': '', 'research/.gdignore': '', 'forge/.gdignore': '', 'tools/.gdignore': '',
};
for (const [f, text] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
  fs.writeFileSync(path.join(dir, f), text);
}
console.log(`created ${dir}: open it with \`godot --path ${path.relative(process.cwd(), dir) || '.'} -e\`, check it with tools/capture-view.mjs`);
