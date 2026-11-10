# Findings (review of the design language, 10 Nov). One line each; fix when they bite.
- `applyLighting()` called twice stacks a second rig; documented as "call once". Make it idempotent if a game reloads levels.
- `applyHouseStyle()` shares one material per role; documented. Per-object effects must clone first.
- Kit regexes are compiled per material per traversal; cache per design if load time on big kits shows up.
- `style-check` does not compare emissive strength (Blender writes it as KHR_materials_emissive_strength, not read here).
