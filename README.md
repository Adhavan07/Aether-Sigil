# Aether Sigil

AR/VR gesture-controlled 3D arcane spellcaster arena built with Three.js, MediaPipe HandLandmarker, React, Tailwind CSS, and an Express + WebSocket multiplayer relay.

## Features
- **Dual-Hand Gesture Combat & AR/VR Modes**: Toggle between mirrored AR webcam passthrough and the 3D VR Obsidian Sanctum, with full mouse & keyboard fallback controls.
- **Gauntlet Forge & Visualizer**: Unlock and equip 5 distinct gauntlets (**Arcane Initiate**, **Mark LXXXV Repulsor**, **Eldritch Mandala**, **Latverian Mystic-Tech**, **Infinity Gauntlet**) featuring custom metallic cuffs, GLSL palm shaders, per-hand particle emitters, pitched SFX, and unique ultimates.
- **Online Co-op & PvP Arena**: Play Solo, Co-op Wave Defense, or PvP Gauntlet Duel over WebSocket rooms with shareable 4-letter room codes.

## Local Development
```bash
npm install
npm run dev
```

## Production Build
```bash
npm run build
```
