# Minecraft Ten Vietnamese textures

Each texture is processed and visually reviewed separately. Completed files are skipped after SHA-256 checks.
All output pixels are copied from the corresponding original texture, using the unchanged Vietnamese atlas layout.
Source-authored transparent cutouts/alpha are preserved inside the glyphs (user instruction 2026-10-27).
No new colors, strokes, effects, alpha silhouettes, models, or overlays are authored.

Commands (repository root):
```powershell
node scripts/build-ten-vietnamese-texture.js next
node scripts/build-ten-vietnamese-texture.js prepare TEXTURE_ID
node scripts/build-ten-vietnamese-texture.js complete TEXTURE_ID "Visual review note"
node scripts/build-ten-vietnamese-texture.js verify
```

Prepare saves a candidate and one-texture review image under `backups/ten-texture-review/`.
Complete installs only that reviewed candidate and registers its original author metadata.
The next texture cannot start while a candidate is awaiting review.
Original third-row faces/bottom caps move down 14px; top caps move down 11px.
New Đ, Ơ/Ư and marks reuse D, O/U and punctuation pixels respectively; top/bottom caps retain their surface class.
Each compressed donor map is saved as `TEXTURE.donors.i32.gz` (little-endian Int32 source pixel index; -1 means transparent).
This is a pixel-copy adaptation, not reconstruction of the original author's procedural recipe.
Offline atlas inspection does not establish live Blockbench rendering. Thumbnails require the project compile workflow.

Completed: 70/119

- [x] `acacia_planks.png`
- [x] `amethyst.png`
- [x] `aroace.png`
- [x] `aromantic.png`
- [x] `asexual.png`
- [x] `atmosphere.png`
- [x] `bamboo.png`
- [x] `bamboo_planks.png`
- [x] `barrel.png`
- [x] `beach.png`
- [x] `bee.png`
- [x] `bevelled_gold.png`
- [x] `birch_planks.png`
- [x] `bisexual.png`
- [x] `blueprint.png`
- [x] `bricks.png`
- [x] `bricks_bare_bones.png`
- [x] `bricks_minecraft.png`
- [x] `bubbles.png`
- [x] `cake.png`
- [x] `cake_minecraft.png`
- [x] `cake_no_drops.png`
- [x] `cake_plain.png`
- [x] `cherry_blossom.png`
- [x] `cherry_blossom_small.png`
- [x] `cherry_planks.png`
- [x] `classic_cobblestone.png`
- [x] `copper.png`
- [x] `cracked.png`
- [x] `cracked_left.png`
- [x] `cracked_old.png`
- [x] `cracked_old_pixelated.png`
- [x] `cracked_right.png`
- [x] `create.png`
- [x] `create_andesite_casing.png`
- [x] `create_brass_casing.png`
- [x] `create_copper_casing.png`
- [x] `create_train_casing.png`
- [x] `creeper.png`
- [x] `crimson_nylium.png`
- [x] `crimson_planks.png`
- [x] `crystal.png`
- [x] `dark_oak_planks.png`
- [x] `deep_dark.png`
- [x] `dock.png`
- [x] `dock_clear.png`
- [x] `dunes.png`
- [x] `dungeons_terracotta.png`
- [x] `earth.png`
- [x] `enby.png`
- [x] `end_crystal.png`
- [x] `enderman.png`
- [x] `femboy.png`
- [x] `fired.png`
- [x] `flames.png`
- [x] `flames_soul.png`
- [x] `flat.png`
- [x] `flat_coloured.png`
- [x] `flowers.png`
- [x] `fluid.png`
- [x] `fruit.png`
- [x] `furnace.png`
- [x] `gay.png`
- [x] `gilded_netherite.png`
- [x] `glow_squid.png`
- [x] `glow_squid_old.png`
- [x] `gradient.png`
- [x] `grass.png`
- [x] `grass_side.png`
- [x] `grass_side_flowers.png`
- [ ] `gurgles.png` — awaiting review
- [ ] `haunted.png`
- [ ] `hay_bale.png`
- [ ] `heterosexual.png`
- [ ] `ice.png`
- [ ] `inner_shadow.png`
- [ ] `intersex.png`
- [ ] `iron_block.png`
- [ ] `jungle_planks.png`
- [ ] `lagoona.png`
- [ ] `lesbian.png`
- [ ] `mangrove.png`
- [ ] `mangrove_planks.png`
- [ ] `midnight.png`
- [ ] `minecon.png`
- [ ] `mineimator.png`
- [ ] `mycelium.png`
- [ ] `neon.png`
- [ ] `neon_glow.png`
- [ ] `netherite.png`
- [ ] `oak_planks.png`
- [ ] `oxidised_copper.png`
- [ ] `oxidising_copper.png`
- [ ] `pale_oak_planks.png`
- [ ] `pansexual.png`
- [ ] `pixel.png`
- [ ] `podzol.png`
- [ ] `pride.png`
- [ ] `sand.png`
- [ ] `simplacity.png`
- [ ] `smooth.png`
- [ ] `smooth_bevelled.png`
- [ ] `smooth_inverted.png`
- [ ] `smooth_inverted_old.png`
- [ ] `smooth_old.png`
- [ ] `sniffer.png`
- [ ] `spruce_planks.png`
- [ ] `story_mode.png`
- [ ] `story_mode1.png`
- [ ] `stripped_bamboo.png`
- [ ] `sunset.png`
- [ ] `terracotta.png`
- [ ] `trails_and_tales.png`
- [ ] `trans.png`
- [ ] `transfeminine.png`
- [ ] `transmasculine.png`
- [ ] `warped_nylium.png`
- [ ] `warped_planks.png`
- [ ] `winter.png`
