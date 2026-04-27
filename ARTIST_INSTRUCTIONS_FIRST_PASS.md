# Line Tower Wars - Artist Instructions (First Pass)

This package defines exactly what to deliver so assets can be dropped into the current build with no code changes.

## 1) Core terminology

- Gameplay Screen: the full in-match UI (top bar, HUD, battlefield, docks, status row).
- Battlefield Canvas: the central battle area only.

For this art pass, you are producing assets for the Battlefield Canvas plus unit/tower icons.

## 2) Battlefield skin deliverable

- Primary file: `lane-bg.png`
- Export size: `420 x 760` pixels
- Format: PNG-24, sRGB

Use this visual placement guide while painting:
- `assets/arena/artist-guide-overlay.svg`

Guidance:
- Design to the full 420x760 area.
- Avoid placing critical details under:
  - left-middle timer zone
  - right-middle mana zone
  - tower slot anchors near top and bottom
- Midline should remain readable for gameplay contrast.

## 3) Tower art deliverables

- Keep current runtime size for this pass.
- One file per tower, transparent background.

Files and export size:
- `violet.png` - `32 x 32`
- `yellow.png` - `32 x 32`
- `red.png` - `32 x 32`
- `green.png` - `32 x 32`
- `orange.png` - `32 x 32`

Format:
- PNG-24 with alpha, sRGB

Notes:
- Keep silhouette centered.
- Leave a little transparent padding around edges.
- Prioritize readability at very small size.

## 4) Attacker art deliverables

One sprite sheet per attacker.

Files:
- `imp-sprite-sheet.png`
- `runner-sprite-sheet.png`
- `brute-sprite-sheet.png`
- `wisp-sprite-sheet.png`
- `tank-sprite-sheet.png`

Per-file layout:
- Sheet size: `192 x 64`
- 3 horizontal frames
- Each frame: `64 x 64`
- Transparent background

Format:
- PNG-24 with alpha, sRGB

## 5) Naming and handoff rules

- Use exact filenames listed above.
- No spaces in filenames.
- No extra suffixes like `_final`, `_v2`, `_new`.
- Deliver source files separately if needed, but exports must match these names and sizes.

## 6) Technical constraints for deployment readiness

- Keep all gameplay assets in PNG with alpha.
- Keep all color in sRGB.
- Avoid tiny text baked into art.
- Avoid edge glow that relies on dark-only backgrounds.
- Ensure strong contrast against both lighter and darker lane zones.

## 7) Drop-in folders

Place final exports here:

- Battlefield skin:
  - `assets/arena/lane-bg.png`
- Towers:
  - `assets/towers/*.png`
- Attackers:
  - `assets/creeps/*-sprite-sheet.png`

If you need reference screenshots from live gameplay placements, request a capture pass from engineering.
