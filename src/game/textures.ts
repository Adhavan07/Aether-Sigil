import * as THREE from 'three';

export interface ProceduralTextures {
  daisAlbedo: THREE.CanvasTexture;
  daisBump: THREE.CanvasTexture;
  stoneAlbedo: THREE.CanvasTexture;
  stoneRoughness: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  sparkSprite: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(
  maxAnisotropy: number,
): ProceduralTextures {
  // 1. Arcane Dais Rune Albedo + Bump (1024x1024)
  const daisCanvas = document.createElement('canvas');
  daisCanvas.width = 1024;
  daisCanvas.height = 1024;
  const dCtx = daisCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 1024;
  bumpCanvas.height = 1024;
  const bCtx = bumpCanvas.getContext('2d')!;

  // Base obsidian stone slate
  dCtx.fillStyle = '#111626';
  dCtx.fillRect(0, 0, 1024, 1024);
  bCtx.fillStyle = '#707070';
  bCtx.fillRect(0, 0, 1024, 1024);

  // Stone grain speckles
  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const r = 1 + Math.random() * 3;
    const shade = 14 + Math.floor(Math.random() * 18);
    dCtx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 14})`;
    dCtx.fillRect(x, y, r, r);

    const bShade = 95 + Math.floor(Math.random() * 40);
    bCtx.fillStyle = `rgb(${bShade}, ${bShade}, ${bShade})`;
    bCtx.fillRect(x, y, r, r);
  }

  // Concentric arcane geometry rings
  const cx = 512;
  const cy = 512;
  const ringRadii = [470, 445, 360, 260, 150];
  ringRadii.forEach((radius, idx) => {
    dCtx.strokeStyle = idx % 2 === 0 ? '#22d3ee' : '#c084fc';
    dCtx.globalAlpha = idx === 0 ? 0.45 : 0.3;
    dCtx.lineWidth = idx === 0 ? 6 : 3;
    dCtx.beginPath();
    dCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    dCtx.stroke();

    bCtx.strokeStyle = '#d0d0d0';
    bCtx.lineWidth = 6;
    bCtx.beginPath();
    bCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    bCtx.stroke();
  });

  // 12 radial rune spokes & sigil ticks
  dCtx.globalAlpha = 0.35;
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const x1 = cx + Math.cos(angle) * 150;
    const y1 = cy + Math.sin(angle) * 150;
    const x2 = cx + Math.cos(angle) * 445;
    const y2 = cy + Math.sin(angle) * 445;
    dCtx.strokeStyle = '#38bdf8';
    dCtx.lineWidth = 2.5;
    dCtx.beginPath();
    dCtx.moveTo(x1, y1);
    dCtx.lineTo(x2, y2);
    dCtx.stroke();

    // Small diamond rune nodes on outer ring
    const rx = cx + Math.cos(angle) * 402;
    const ry = cy + Math.sin(angle) * 402;
    dCtx.save();
    dCtx.translate(rx, ry);
    dCtx.rotate(angle);
    dCtx.fillStyle = '#fbbf24';
    dCtx.fillRect(-7, -7, 14, 14);
    dCtx.restore();
  }
  dCtx.globalAlpha = 1;

  const daisAlbedo = new THREE.CanvasTexture(daisCanvas);
  daisAlbedo.colorSpace = THREE.SRGBColorSpace;
  daisAlbedo.anisotropy = maxAnisotropy;

  const daisBump = new THREE.CanvasTexture(bumpCanvas);
  daisBump.anisotropy = maxAnisotropy;

  // 2. Carved Monolith Stone Albedo + Roughness (512x512)
  const stoneCanvas = document.createElement('canvas');
  stoneCanvas.width = 512;
  stoneCanvas.height = 512;
  const sCtx = stoneCanvas.getContext('2d')!;
  sCtx.fillStyle = '#1e2436';
  sCtx.fillRect(0, 0, 512, 512);

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 512;
  roughCanvas.height = 512;
  const rCtx = roughCanvas.getContext('2d')!;
  rCtx.fillStyle = '#b8b8b8';
  rCtx.fillRect(0, 0, 512, 512);

  for (let y = 0; y < 512; y += 64) {
    sCtx.strokeStyle = 'rgba(8, 11, 20, 0.7)';
    sCtx.lineWidth = 4;
    sCtx.beginPath();
    sCtx.moveTo(0, y);
    sCtx.lineTo(512, y);
    sCtx.stroke();

    rCtx.strokeStyle = '#ffffff';
    rCtx.lineWidth = 4;
    rCtx.beginPath();
    rCtx.moveTo(0, y);
    rCtx.lineTo(512, y);
    rCtx.stroke();
  }
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 22 + Math.floor(Math.random() * 24);
    sCtx.fillStyle = `rgb(${v}, ${v + 5}, ${v + 16})`;
    sCtx.fillRect(x, y, 3, 3);
  }

  const stoneAlbedo = new THREE.CanvasTexture(stoneCanvas);
  stoneAlbedo.colorSpace = THREE.SRGBColorSpace;
  stoneAlbedo.wrapS = THREE.RepeatWrapping;
  stoneAlbedo.wrapT = THREE.RepeatWrapping;
  stoneAlbedo.anisotropy = maxAnisotropy;

  const stoneRoughness = new THREE.CanvasTexture(roughCanvas);
  stoneRoughness.wrapS = THREE.RepeatWrapping;
  stoneRoughness.wrapT = THREE.RepeatWrapping;

  // 3. Soft Radial Contact Shadow (256x256)
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const shCtx = shadowCanvas.getContext('2d')!;
  const shGrad = shCtx.createRadialGradient(128, 128, 12, 128, 128, 124);
  shGrad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  shGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.3)');
  shGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shCtx.fillStyle = shGrad;
  shCtx.fillRect(0, 0, 256, 256);

  const contactShadow = new THREE.CanvasTexture(shadowCanvas);

  // 4. Crisp Radial Spark / Orb Sprite (128x128)
  const sparkCanvas = document.createElement('canvas');
  sparkCanvas.width = 128;
  sparkCanvas.height = 128;
  const spCtx = sparkCanvas.getContext('2d')!;
  const spGrad = spCtx.createRadialGradient(64, 64, 2, 64, 64, 62);
  spGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  spGrad.addColorStop(0.28, 'rgba(255, 255, 255, 0.85)');
  spGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.2)');
  spGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  spCtx.fillStyle = spGrad;
  spCtx.fillRect(0, 0, 128, 128);

  const sparkSprite = new THREE.CanvasTexture(sparkCanvas);
  sparkSprite.colorSpace = THREE.SRGBColorSpace;

  return {
    daisAlbedo,
    daisBump,
    stoneAlbedo,
    stoneRoughness,
    contactShadow,
    sparkSprite,
    dispose: () => {
      daisAlbedo.dispose();
      daisBump.dispose();
      stoneAlbedo.dispose();
      stoneRoughness.dispose();
      contactShadow.dispose();
      sparkSprite.dispose();
    },
  };
}
