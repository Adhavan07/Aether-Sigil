import * as THREE from 'three';
import { GauntletId } from '../types/game';
import { getGauntletSpec } from './gauntlets';
import { ProceduralTextures } from './textures';

export interface SanctumRig {
  root: THREE.Group;
  vrOnlyGroup: THREE.Group;
  arDaisGroup: THREE.Group;
  braziers: THREE.Group[];
  astrolabeRings: THREE.Mesh[];
  motes: THREE.InstancedMesh;
  moteBasePositions: Float32Array;
  motePhases: Float32Array;
  dispose: () => void;
}

export interface HandGauntletRig {
  root: THREE.Group;
  jointSpheres: THREE.Mesh[];
  boneSegments: THREE.Mesh[];
  palmRing: THREE.Mesh;
  palmCore: THREE.Mesh;
  wardShieldGroup: THREE.Group | null;
  wardMaterial: THREE.MeshPhysicalMaterial | null;
  accentMaterial: THREE.MeshStandardMaterial;
  boneMaterial: THREE.MeshStandardMaterial;
}

export type EnemyKind = 'wisp' | 'sentinel' | 'spire';

export interface EnemyRig {
  root: THREE.Group;
  bodyParts: THREE.Mesh[];
  orbiters: THREE.Object3D[];
  visorMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshStandardMaterial;
  coreMat: THREE.MeshStandardMaterial;
  contactShadow: THREE.Mesh;
}

export type CrystalKind = 'overcharge' | 'chrono' | 'vitality';

export interface InteractiveCrystalRig {
  root: THREE.Group;
  core: THREE.Mesh;
  ring: THREE.Mesh;
  dispose: () => void;
}

export interface RemoteAvatarRig {
  root: THREE.Group;
  body: THREE.Mesh;
  helm: THREE.Mesh;
  pauldronL: THREE.Mesh;
  pauldronR: THREE.Mesh;
  gauntletOrb: THREE.Mesh;
  shieldMesh: THREE.Mesh;
  accentMat: THREE.MeshStandardMaterial;
  setGauntletColor: (id: GauntletId) => void;
  dispose: () => void;
}

const HAND_BONES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export function createSanctumArena(
  textures: ProceduralTextures,
  isSoftwareGl: boolean,
): SanctumRig {
  const root = new THREE.Group();
  const vrOnlyGroup = new THREE.Group();
  const arDaisGroup = new THREE.Group();
  root.add(vrOnlyGroup);
  root.add(arDaisGroup);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const obsidianMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x161b2e,
      map: textures.stoneAlbedo,
      roughnessMap: textures.stoneRoughness,
      roughness: 0.78,
      metalness: 0.12,
    }),
  );

  const bronzeMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xc59a5b,
      roughness: 0.24,
      metalness: 0.92,
      anisotropy: 0.7,
      clearcoat: 0.35,
    }),
  );

  const runeGlowCyan = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.5,
      roughness: 0.2,
      metalness: 0.4,
    }),
  );

  const runeGlowAmber = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.4,
      roughness: 0.25,
      metalness: 0.3,
    }),
  );

  const daisMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.daisAlbedo,
      bumpMap: textures.daisBump,
      bumpScale: 0.04,
      roughness: 0.52,
      metalness: 0.22,
    }),
  );

  const daisBaseGeo = trackGeo(new THREE.CylinderGeometry(3.8, 4.3, 0.34, 8));
  const daisBase = new THREE.Mesh(daisBaseGeo, obsidianMat);
  daisBase.position.y = -1.65;
  daisBase.receiveShadow = true;
  arDaisGroup.add(daisBase);

  const daisPlateGeo = trackGeo(new THREE.CylinderGeometry(3.55, 3.65, 0.06, 32));
  const daisPlate = new THREE.Mesh(daisPlateGeo, daisMat);
  daisPlate.position.y = -1.45;
  daisPlate.receiveShadow = true;
  arDaisGroup.add(daisPlate);

  const daisTrimGeo = trackGeo(new THREE.TorusGeometry(3.62, 0.06, 12, 48));
  const daisTrim = new THREE.Mesh(daisTrimGeo, bronzeMat);
  daisTrim.rotation.x = Math.PI / 2;
  daisTrim.position.y = -1.42;
  arDaisGroup.add(daisTrim);

  const casterArcGeo = trackGeo(new THREE.TorusGeometry(2.4, 0.025, 10, 64, Math.PI * 0.7));
  const casterArc = new THREE.Mesh(casterArcGeo, runeGlowCyan);
  casterArc.rotation.x = Math.PI / 2;
  casterArc.rotation.z = Math.PI * 0.15;
  casterArc.position.set(0, -1.36, -0.35);
  arDaisGroup.add(casterArc);

  const outerPlatformGeo = trackGeo(new THREE.CylinderGeometry(18, 22, 1.2, 16));
  const outerPlatform = new THREE.Mesh(outerPlatformGeo, obsidianMat);
  outerPlatform.position.set(0, -2.35, -8);
  outerPlatform.receiveShadow = true;
  vrOnlyGroup.add(outerPlatform);

  const contactShadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    }),
  );
  const shadowQuadGeo = trackGeo(new THREE.PlaneGeometry(3.4, 3.4));

  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0.42, 0);
  finShape.lineTo(0.26, 1.45);
  finShape.lineTo(0.05, 1.85);
  finShape.lineTo(0, 1.85);
  finShape.closePath();

  const finGeo = trackGeo(
    new THREE.ExtrudeGeometry(finShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 2,
    }),
  );

  const bowlPoints = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.32, 0.08),
    new THREE.Vector2(0.55, 0.35),
    new THREE.Vector2(0.45, 0.42),
    new THREE.Vector2(0.24, 0.18),
    new THREE.Vector2(0, 0.16),
  ];
  const bowlGeo = trackGeo(new THREE.LatheGeometry(bowlPoints, 20));
  const obeliskShaftGeo = trackGeo(new THREE.CylinderGeometry(0.48, 0.72, 6.2, 6));
  const obeliskPlinthGeo = trackGeo(new THREE.CylinderGeometry(0.95, 1.15, 0.65, 6));
  const obeliskBandGeo = trackGeo(new THREE.TorusGeometry(0.64, 0.055, 10, 24));
  const crystalGeo = trackGeo(new THREE.OctahedronGeometry(0.36, 0));

  const braziers: THREE.Group[] = [];
  const obeliskCount = 8;
  for (let i = 0; i < obeliskCount; i++) {
    const angle = (i / obeliskCount) * Math.PI * 2 + Math.PI / 8;
    const radius = 14.5;
    const ox = Math.cos(angle) * radius;
    const oz = -8 + Math.sin(angle) * radius;

    const obelisk = new THREE.Group();
    obelisk.position.set(ox, -1.75, oz);
    obelisk.lookAt(0, -1.75, -8);

    const cShadow = new THREE.Mesh(shadowQuadGeo, contactShadowMat);
    cShadow.rotation.x = -Math.PI / 2;
    cShadow.position.y = 0.03;
    obelisk.add(cShadow);

    const plinth = new THREE.Mesh(obeliskPlinthGeo, obsidianMat);
    plinth.position.y = 0.325;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    obelisk.add(plinth);

    const shaft = new THREE.Mesh(obeliskShaftGeo, obsidianMat);
    shaft.position.y = 3.45;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    obelisk.add(shaft);

    const bandLow = new THREE.Mesh(obeliskBandGeo, bronzeMat);
    bandLow.rotation.x = Math.PI / 2;
    bandLow.position.y = 1.6;
    obelisk.add(bandLow);

    const bandHigh = new THREE.Mesh(obeliskBandGeo, bronzeMat);
    bandHigh.rotation.x = Math.PI / 2;
    bandHigh.scale.setScalar(0.82);
    bandHigh.position.y = 5.4;
    obelisk.add(bandHigh);

    const finL = new THREE.Mesh(finGeo, obsidianMat);
    finL.position.set(0.32, 6.2, -0.06);
    obelisk.add(finL);

    const finR = new THREE.Mesh(finGeo, obsidianMat);
    finR.rotation.y = Math.PI;
    finR.position.set(-0.32, 6.2, 0.06);
    obelisk.add(finR);

    const brazier = new THREE.Group();
    brazier.position.set(0, 6.55, 0);
    const bowl = new THREE.Mesh(bowlGeo, bronzeMat);
    brazier.add(bowl);

    const crystal = new THREE.Mesh(
      crystalGeo,
      i % 2 === 0 ? runeGlowCyan : runeGlowAmber,
    );
    crystal.position.y = 0.85;
    brazier.add(crystal);

    obelisk.add(brazier);
    braziers.push(brazier);

    vrOnlyGroup.add(obelisk);
  }

  const astrolabeRings: THREE.Mesh[] = [];
  const ringConfigs = [
    { r: 13.5, tube: 0.09, tiltX: 0.38, tiltZ: 0.2 },
    { r: 11.2, tube: 0.07, tiltX: -0.45, tiltZ: -0.32 },
    { r: 8.8, tube: 0.055, tiltX: 0.62, tiltZ: -0.15 },
  ];
  ringConfigs.forEach((cfg, idx) => {
    const rGeo = trackGeo(new THREE.TorusGeometry(cfg.r, cfg.tube, 12, 72));
    const rMesh = new THREE.Mesh(rGeo, idx === 1 ? runeGlowCyan : bronzeMat);
    rMesh.position.set(0, 5.5, -10);
    rMesh.rotation.set(cfg.tiltX, 0, cfg.tiltZ);
    vrOnlyGroup.add(rMesh);
    astrolabeRings.push(rMesh);
  });

  const moteCount = isSoftwareGl ? 70 : 160;
  const moteGeo = trackGeo(new THREE.OctahedronGeometry(0.075, 0));
  const moteMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.78,
    }),
  );
  const motes = new THREE.InstancedMesh(moteGeo, moteMat, moteCount);
  motes.frustumCulled = false;

  const moteBasePositions = new Float32Array(moteCount * 3);
  const motePhases = new Float32Array(moteCount);
  const dummy = new THREE.Object3D();
  const palette = [
    new THREE.Color(0x22d3ee),
    new THREE.Color(0xfbbf24),
    new THREE.Color(0x34d399),
    new THREE.Color(0xa78bfa),
  ];

  for (let i = 0; i < moteCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 4 + Math.random() * 14;
    const x = Math.cos(angle) * dist;
    const y = -0.8 + Math.random() * 8.5;
    const z = -8 + Math.sin(angle) * dist;
    moteBasePositions[i * 3] = x;
    moteBasePositions[i * 3 + 1] = y;
    moteBasePositions[i * 3 + 2] = z;
    motePhases[i] = Math.random() * Math.PI * 2;

    dummy.position.set(x, y, z);
    dummy.scale.setScalar(0.65 + Math.random() * 0.75);
    dummy.updateMatrix();
    motes.setMatrixAt(i, dummy.matrix);
    motes.setColorAt(i, palette[i % palette.length]);
  }
  motes.instanceMatrix.needsUpdate = true;
  if (motes.instanceColor) motes.instanceColor.needsUpdate = true;
  motes.computeBoundingSphere();
  vrOnlyGroup.add(motes);

  return {
    root,
    vrOnlyGroup,
    arDaisGroup,
    braziers,
    astrolabeRings,
    motes,
    moteBasePositions,
    motePhases,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

export function createHandGauntlet(isLeft: boolean): HandGauntletRig {
  const root = new THREE.Group();
  const baseColor = isLeft ? 0x34d399 : 0x22d3ee;

  const accentMaterial = new THREE.MeshStandardMaterial({
    color: baseColor,
    emissive: baseColor,
    emissiveIntensity: 1.4,
    roughness: 0.2,
    metalness: 0.6,
  });

  const boneMaterial = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    emissive: baseColor,
    emissiveIntensity: 0.45,
    roughness: 0.35,
    metalness: 0.7,
  });

  const jointGeo = new THREE.SphereGeometry(0.022, 10, 10);
  const tipGeo = new THREE.OctahedronGeometry(0.028, 0);
  const jointSpheres: THREE.Mesh[] = [];

  for (let i = 0; i < 21; i++) {
    const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
    const mesh = new THREE.Mesh(
      isTip ? tipGeo : jointGeo,
      isTip ? accentMaterial : boneMaterial,
    );
    root.add(mesh);
    jointSpheres.push(mesh);
  }

  const boneGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 6);
  const boneSegments: THREE.Mesh[] = [];
  for (let i = 0; i < HAND_BONES.length; i++) {
    const seg = new THREE.Mesh(boneGeo, boneMaterial);
    root.add(seg);
    boneSegments.push(seg);
  }

  const palmRingGeo = new THREE.TorusGeometry(0.11, 0.012, 8, 24);
  const palmRing = new THREE.Mesh(palmRingGeo, accentMaterial);
  root.add(palmRing);

  const palmCoreGeo = new THREE.OctahedronGeometry(0.045, 0);
  const palmCore = new THREE.Mesh(palmCoreGeo, accentMaterial);
  root.add(palmCore);

  let wardShieldGroup: THREE.Group | null = null;
  let wardMaterial: THREE.MeshPhysicalMaterial | null = null;

  if (isLeft) {
    wardShieldGroup = new THREE.Group();
    wardMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x34d399,
      emissive: 0x059669,
      emissiveIntensity: 0.85,
      transparent: true,
      opacity: 0.38,
      roughness: 0.12,
      metalness: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const hexDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 6),
      wardMaterial,
    );
    wardShieldGroup.add(hexDisc);

    const outerHexFrame = new THREE.Mesh(
      new THREE.TorusGeometry(0.87, 0.032, 8, 6),
      accentMaterial,
    );
    wardShieldGroup.add(outerHexFrame);

    const innerHexFrame = new THREE.Mesh(
      new THREE.TorusGeometry(0.52, 0.02, 8, 6),
      accentMaterial,
    );
    wardShieldGroup.add(innerHexFrame);

    wardShieldGroup.visible = false;
    root.add(wardShieldGroup);
  }

  return {
    root,
    jointSpheres,
    boneSegments,
    palmRing,
    palmCore,
    wardShieldGroup,
    wardMaterial,
    accentMaterial,
    boneMaterial,
  };
}

export function getHandBones(): Array<[number, number]> {
  return HAND_BONES;
}

export function createEnemyModel(
  kind: EnemyKind,
  contactTexture: THREE.Texture,
): EnemyRig {
  const root = new THREE.Group();
  const bodyParts: THREE.Mesh[] = [];
  const orbiters: THREE.Object3D[] = [];

  const bodyMat = new THREE.MeshStandardMaterial({
    color: kind === 'wisp' ? 0x1e1b4b : kind === 'sentinel' ? 0x1e293b : 0x271936,
    roughness: 0.65,
    metalness: 0.25,
  });

  const trimMat = new THREE.MeshStandardMaterial({
    color: kind === 'spire' ? 0xd4af37 : 0x94a3b8,
    roughness: 0.25,
    metalness: 0.9,
  });

  const coreColor =
    kind === 'wisp' ? 0xa855f7 : kind === 'sentinel' ? 0xf59e0b : 0xf43f5e;
  const coreMat = new THREE.MeshStandardMaterial({
    color: coreColor,
    emissive: coreColor,
    emissiveIntensity: 1.5,
    roughness: 0.2,
    metalness: 0.3,
  });

  const visorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: coreColor,
    emissiveIntensity: 1.9,
    roughness: 0.15,
    metalness: 0.1,
  });

  const shadowSize = kind === 'spire' ? 3.2 : kind === 'sentinel' ? 2.4 : 1.5;
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(shadowSize, shadowSize),
    new THREE.MeshBasicMaterial({
      map: contactTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.48,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = -1.38;
  root.add(contactShadow);

  if (kind === 'wisp') {
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), bodyMat);
    core.castShadow = true;
    root.add(core);
    bodyParts.push(core);

    const visor = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.045, 8, 24), visorMat);
    visor.rotation.x = Math.PI * 0.42;
    root.add(visor);
    bodyParts.push(visor);

    const tailRing = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.68, 6), trimMat);
    tailRing.rotation.x = Math.PI;
    tailRing.position.y = -0.52;
    root.add(tailRing);
    bodyParts.push(tailRing);

    const shardGeo = new THREE.OctahedronGeometry(0.16, 0);
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 3) * Math.PI * 2;
      const shard = new THREE.Mesh(shardGeo, coreMat);
      shard.position.set(0.72, 0.1 * Math.sin(i * 2), 0);
      pivot.add(shard);
      root.add(pivot);
      orbiters.push(pivot);
      bodyParts.push(shard);
    }
  } else if (kind === 'sentinel') {
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.35, 1.15, 6), bodyMat);
    torso.castShadow = true;
    root.add(torso);
    bodyParts.push(torso);

    const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), trimMat);
    crest.position.y = 0.88;
    root.add(crest);
    bodyParts.push(crest);

    const visorEye = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.38), visorMat);
    visorEye.position.set(0, 0.82, 0.18);
    root.add(visorEye);
    bodyParts.push(visorEye);

    const pauldronGeo = new THREE.BoxGeometry(0.45, 0.62, 0.55);
    const pauldronL = new THREE.Mesh(pauldronGeo, bodyMat);
    pauldronL.position.set(-0.78, 0.32, 0);
    pauldronL.rotation.z = 0.25;
    root.add(pauldronL);
    bodyParts.push(pauldronL);

    const pauldronR = new THREE.Mesh(pauldronGeo, bodyMat);
    pauldronR.position.set(0.78, 0.32, 0);
    pauldronR.rotation.z = -0.25;
    root.add(pauldronR);
    bodyParts.push(pauldronR);

    const corePrism = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), coreMat);
    corePrism.position.set(0, 0.18, 0.45);
    root.add(corePrism);
    orbiters.push(corePrism);
    bodyParts.push(corePrism);

    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.045, 8, 24), trimMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -0.45;
    root.add(halo);
    orbiters.push(halo);
    bodyParts.push(halo);
  } else {
    const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), coreMat);
    heart.castShadow = true;
    root.add(heart);
    bodyParts.push(heart);

    const eyeBand = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.06, 10, 28), visorMat);
    root.add(eyeBand);
    bodyParts.push(eyeBand);

    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.95 + i * 0.24, 0.045, 10, 36),
        i === 1 ? bodyMat : trimMat,
      );
      ring.rotation.set(i * 0.6, i * 0.8, 0);
      root.add(ring);
      orbiters.push(ring);
      bodyParts.push(ring);
    }

    const pylonGeo = new THREE.ConeGeometry(0.18, 0.65, 5);
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const pylon = new THREE.Mesh(pylonGeo, bodyMat);
      pylon.position.set(Math.cos(angle) * 1.45, 0, Math.sin(angle) * 1.45);
      pylon.lookAt(0, 0, 0);
      root.add(pylon);
      bodyParts.push(pylon);
    }
  }

  return {
    root,
    bodyParts,
    orbiters,
    visorMat,
    bodyMat,
    coreMat,
    contactShadow,
  };
}

export function createInteractiveCrystal(kind: CrystalKind): InteractiveCrystalRig {
  const root = new THREE.Group();
  const hex =
    kind === 'overcharge'
      ? 0x22d3ee
      : kind === 'chrono'
        ? 0xfbbf24
        : 0x34d399;

  const coreGeo = new THREE.OctahedronGeometry(0.38, 0);
  const coreMat = new THREE.MeshPhysicalMaterial({
    color: hex,
    emissive: hex,
    emissiveIntensity: 1.55,
    roughness: 0.12,
    metalness: 0.2,
    clearcoat: 0.9,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  root.add(core);

  const ringGeo = new THREE.TorusGeometry(0.62, 0.035, 8, 28);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: hex,
    emissiveIntensity: 1.2,
    roughness: 0.2,
    metalness: 0.8,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  root.add(ring);

  return {
    root,
    core,
    ring,
    dispose: () => {
      coreGeo.dispose();
      coreMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
    },
  };
}

export function createRemoteAvatar(gauntletId: GauntletId): RemoteAvatarRig {
  const root = new THREE.Group();
  const spec = getGauntletSpec(gauntletId);

  const slateMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.55,
    metalness: 0.35,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: spec.primaryHex,
    emissive: spec.primaryHex,
    emissiveIntensity: 1.4,
    roughness: 0.2,
    metalness: 0.75,
  });

  const bodyGeo = new THREE.CylinderGeometry(0.32, 0.42, 1.05, 8);
  const body = new THREE.Mesh(bodyGeo, slateMat);
  body.position.y = 0.52;
  root.add(body);

  const helmGeo = new THREE.OctahedronGeometry(0.26, 0);
  const helm = new THREE.Mesh(helmGeo, accentMat);
  helm.position.y = 1.32;
  root.add(helm);

  const pauldronGeo = new THREE.BoxGeometry(0.28, 0.32, 0.32);
  const pauldronL = new THREE.Mesh(pauldronGeo, slateMat);
  pauldronL.position.set(-0.46, 0.95, 0);
  pauldronL.rotation.z = 0.3;
  root.add(pauldronL);

  const pauldronR = new THREE.Mesh(pauldronGeo, slateMat);
  pauldronR.position.set(0.46, 0.95, 0);
  pauldronR.rotation.z = -0.3;
  root.add(pauldronR);

  const orbGeo = new THREE.SphereGeometry(0.16, 14, 14);
  const gauntletOrb = new THREE.Mesh(orbGeo, accentMat);
  gauntletOrb.position.set(0.56, 0.85, -0.35);
  root.add(gauntletOrb);

  const shieldGeo = new THREE.CircleGeometry(0.75, 6);
  const shieldMat = new THREE.MeshBasicMaterial({
    color: spec.secondaryHex,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
  });
  const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  shieldMesh.position.set(-0.2, 0.9, -0.55);
  shieldMesh.visible = false;
  root.add(shieldMesh);

  return {
    root,
    body,
    helm,
    pauldronL,
    pauldronR,
    gauntletOrb,
    shieldMesh,
    accentMat,
    setGauntletColor: (id: GauntletId) => {
      const s = getGauntletSpec(id);
      accentMat.color.setHex(s.primaryHex);
      accentMat.emissive.setHex(s.primaryHex);
      shieldMat.color.setHex(s.secondaryHex);
    },
    dispose: () => {
      bodyGeo.dispose();
      helmGeo.dispose();
      pauldronGeo.dispose();
      orbGeo.dispose();
      shieldGeo.dispose();
      slateMat.dispose();
      accentMat.dispose();
      shieldMat.dispose();
    },
  };
}
