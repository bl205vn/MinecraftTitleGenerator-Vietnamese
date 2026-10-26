# Minecraft Ten Vietnamese overlays

These 21 overlays adapt `fonts/minecraft-ten/overlays` to the current
`fonts/minecraft-ten-vietnamese/textures/flat.png`. Flat and character models
are read-only inputs. Each overlay is generated and audited individually.

## Rebuild one overlay

From the repository root:

```powershell
.\.tools\node-v22.23.4-win-x64\node.exe scripts/build-ten-vietnamese-overlay.js highlights_top
.\.tools\node-v22.23.4-win-x64\node.exe scripts/build-ten-vietnamese-overlay.js highlights_top --apply
.\.tools\node-v22.23.4-win-x64\node.exe scripts/verify-ten-vietnamese-overlays.js
```

The first command is a dry run. There is deliberately no batch `--all` option:
review one overlay before creating the next. Applying updates that overlay's
entry in the Vietnamese `textures.json`, preserving the original author's
credit and adding `bl205vn`. Existing output PNGs are backed up before replacement.

Reports and neutral-color previews are in `backups/ten-overlay-review/results`.
The final independent asset audit is `backups/ten-overlay-review/verification.json`.
Its `customRegionCoverage` records each added letter/accent separately.

## Dimensions and atlas correspondence

- Original 1000×320 overlays stay 1000×320.
- Bevel variants, Cartoon and both Shine overlays stay 4000×1280.
- The original third-row top strips at Y172–194 move to Y183–205.
- Original third-row front/bottom content moves down 14 pixels where applicable.
- New `đ`, `ơ`, `ư` and accent regions derive from the actual current Flat mask.
- The independent audit checks dimensions, RGB/alpha palette, transparent RGB,
  registration/credits, atlas SHA-256, original matching glyph pixels, and new
  region coverage. It rejects visible pixels on transparent or black Flat areas.

## Construction and validation limits

| Group | Method |
|---|---|
| Directional highlights, Outline, Inset Outline | Geometry-derived pixel edges; independently compared with original artwork |
| Glass Tempered | Exact color-class Chebyshev distance rule, independently reproduces original pixels |
| Outline Fade | Original per-row RGBA profile and 1px inward edge |
| Edge Fade | Original cap profile, preserving source dithering on corresponding surfaces |
| Bevel variants | Preserve authored original glyph pixels; consistent directional inward bevel for new shapes |
| Cracks, Tiles, Glass/Old Glass | Preserve original glyph-local artwork; transfer unscaled stencils and complete appropriate edges/glints on new shapes |
| Texture Highlight variants | Original alpha profiles and glyph/surface correspondence |
| Shine variants | Preserve original pixels; diagonal stripe field and vertical alpha profile learned from source artwork, with source-palette dithering for new shapes |
| Cartoon | Preserve original pixels; directional affine wedge adaptation on new shapes |

Hand-painted overlays do not have a proven universal source-generation formula.
Returning/copying source artwork is **preservation**, not independent proof that
an inferred algorithm reproduces it. In particular, the new Cartoon and bevel
corners are style adaptations and should still be reviewed in Blockbench.

The geometric highlight rule fills four omitted source Top edge pixels and twenty
omitted Bottom edge pixels. These are the only differences on corresponding
original white glyph pixels; every other overlay matches those pixels exactly.
Known stray source pixels outside Flat are excluded, including the alpha1 pixel
at (999,319) in both Texture Highlights and twelve Glass pixels at X284–295,Y45.

Sparse Cracks/Tiles and row-positioned fades can intentionally leave a small accent
unmarked; this mirrors how the original handles small punctuation. Edge effects
that should cover every added component are checked for nonzero coverage there.

No models or Flat pixels are changed by overlay generation. A real Blockbench
integration/render test is separate from these offline pixel checks. For testing
in the user's existing workflow: compile, commit/push the generated data, reload
the plugin, and create new text.
