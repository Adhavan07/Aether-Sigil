import * as THREE from 'three';
import { GauntletId, HandSign } from '../types/game';

export interface GauntletSpec {
  id: GauntletId;
  name: string;
  subtitle: string;
  cost: number;
  imageUrl: string;
  primaryHex: number;
  secondaryHex: number;
  accentCss: string;
  boltLabel: string;
  ultimateLabel: string;
  perkSummary: string;
  damageMult: number;
  speedMult: number;
  splashMult: number;
  parryBonus: number;
}

export const GAUNTLET_CATALOG: GauntletSpec[] = [
  {
    id: 'arcane',
    name: 'Arcane Initiate',
    subtitle: 'Astral Sigil Frame',
    cost: 0,
    imageUrl: '/src/assets/images/gauntlet_arcane_1794921877716.jpg',
    primaryHex: 0x22d3ee,
    secondaryHex: 0x34d399,
    accentCss: '#22d3ee',
    boltLabel: 'Astral Bolt',
    ultimateLabel: 'Cataclysm Convergence',
    perkSummary: 'Balanced cooldowns & crisp cyan sigil precision',
    damageMult: 1.0,
    speedMult: 1.0,
    splashMult: 1.0,
    parryBonus: 18,
  },
  {
    id: 'iron_man',
    name: 'Mark LXXXV Repulsor',
    subtitle: 'Arc-Reactor Armor',
    cost: 400,
    imageUrl: '/src/assets/images/gauntlet_ironman_1794921879013.jpg',
    primaryHex: 0x38bdf8,
    secondaryHex: 0xef4444,
    accentCss: '#38bdf8',
    boltLabel: 'Repulsor Beam',
    ultimateLabel: 'Unibeam Overdrive',
    perkSummary: '+35% bolt velocity · Twin homing micro-missiles',
    damageMult: 1.18,
    speedMult: 1.35,
    splashMult: 1.15,
    parryBonus: 20,
  },
  {
    id: 'doctor_strange',
    name: 'Eldritch Mandala',
    subtitle: 'Kamar-Taj Mystic Seals',
    cost: 800,
    imageUrl: '/src/assets/images/gauntlet_strange_1794921879122.jpg',
    primaryHex: 0xf59e0b,
    secondaryHex: 0xfde047,
    accentCss: '#fbbf24',
    boltLabel: 'Bolts of Balthakk',
    ultimateLabel: 'Mirror Dimension Rift',
    perkSummary: 'Triple-bolt spread · Shield of Seraphim +50% parry energy',
    damageMult: 1.15,
    speedMult: 1.1,
    splashMult: 1.25,
    parryBonus: 28,
  },
  {
    id: 'doctor_doom',
    name: 'Latverian Mystic-Tech',
    subtitle: 'Titanium & Verdant Plasma',
    cost: 1200,
    imageUrl: '/src/assets/images/gauntlet_doom_1794921880128.jpg',
    primaryHex: 0x10b981,
    secondaryHex: 0xa855f7,
    accentCss: '#10b981',
    boltLabel: 'Doom Plasma Surge',
    ultimateLabel: 'Verdant Tempest',
    perkSummary: '+35% spell damage · Thorny emerald parry counter-blast',
    damageMult: 1.35,
    speedMult: 1.15,
    splashMult: 1.3,
    parryBonus: 22,
  },
  {
    id: 'thanos',
    name: 'Infinity Gauntlet',
    subtitle: 'Uru Gold & Six Singularities',
    cost: 2000,
    imageUrl: '/src/assets/images/gauntlet_thanos_1794921880234.jpg',
    primaryHex: 0xa855f7,
    secondaryHex: 0xfbbf24,
    accentCss: '#c084fc',
    boltLabel: 'Reality Shard',
    ultimateLabel: 'The Snap',
    perkSummary: '+50% AoE radius · Reality-warping shards & cosmic Snap',
    damageMult: 1.45,
    speedMult: 1.2,
    splashMult: 1.5,
    parryBonus: 25,
  },
];

export function getGauntletSpec(id: GauntletId): GauntletSpec {
  return GAUNTLET_CATALOG.find((g) => g.id === id) ?? GAUNTLET_CATALOG[0];
}

// ============================================================================
// Custom GLSL Shaders for Palm Visualizers (with downloaded distortion maps)
// ============================================================================

const COMMON_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ARC_REACTOR_FRAG = `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uCharge;
  uniform vec3 uColor;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float a = atan(p.y, p.x);

    float core = smoothstep(0.32, 0.05, r);
    float ring1 = smoothstep(0.04, 0.0, abs(r - 0.48));
    float ring2 = smoothstep(0.035, 0.0, abs(r - 0.76));
    float segments = step(0.18, sin(a * 10.0 + uTime * 3.5));
    float arcRing = ring2 * (0.4 + 0.6 * segments);

    float pulse = 0.85 + 0.25 * sin(uTime * 8.0 + uCharge * 4.0);
    float alpha = clamp((core + ring1 + arcRing) * smoothstep(1.0, 0.78, r), 0.0, 1.0);
    vec3 col = mix(uColor, vec3(0.92, 0.99, 1.0), core * 0.85 + uCharge * 0.3) * pulse;
    gl_FragColor = vec4(col, alpha);
  }
`;

const MANDALA_FRAG = `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uCharge;
  uniform vec3 uColor;

  float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float a = atan(p.y, p.x);

    float c = cos(uTime * 1.4);
    float s = sin(uTime * 1.4);
    vec2 p1 = mat2(c, -s, s, c) * p;
    vec2 p2 = mat2(c, s, -s, c) * p;

    float sq1 = smoothstep(0.03, 0.0, abs(sdBox(p1, vec2(0.46))));
    float sq2 = smoothstep(0.03, 0.0, abs(sdBox(p2, vec2(0.46))));
    float outer = smoothstep(0.04, 0.0, abs(r - 0.82));
    float inner = smoothstep(0.03, 0.0, abs(r - 0.34));
    float runes = smoothstep(0.03, 0.0, abs(r - 0.68)) * step(0.0, sin(a * 18.0 - uTime * 4.0));

    float alpha = clamp((sq1 + sq2 + outer + inner + runes) * smoothstep(1.0, 0.85, r), 0.0, 1.0);
    vec3 col = mix(uColor, vec3(1.0, 0.96, 0.78), (inner + sq1 * 0.5 + uCharge * 0.4));
    gl_FragColor = vec4(col * 1.35, alpha);
  }
`;

const DOOM_PLASMA_FRAG = `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uCharge;
  uniform vec3 uColor;
  uniform sampler2D uDistortTex;

  void main() {
    vec2 n = texture2D(uDistortTex, vUv * 1.5 + vec2(uTime * 0.15, -uTime * 0.12)).rg - 0.5;
    vec2 p = (vUv - 0.5) * 2.0 + n * 0.14;
    float r = length(p);
    float a = atan(p.y, p.x);

    float wave = sin(r * 14.0 - uTime * 6.0 + sin(a * 5.0 + uTime * 2.5));
    float lightning = smoothstep(0.72, 0.98, abs(sin(a * 6.0 + uTime * 4.0 + r * 6.0)));
    float hexRing = smoothstep(0.045, 0.0, abs(r - (0.66 + 0.04 * sin(a * 6.0))));
    float core = smoothstep(0.35, 0.0, r) * (0.65 + 0.35 * wave);

    float alpha = clamp((core + hexRing + lightning * 0.65) * smoothstep(0.98, 0.68, r), 0.0, 1.0);
    vec3 col = mix(uColor, vec3(0.68, 0.35, 1.0), lightning * 0.5 + uCharge * 0.35);
    gl_FragColor = vec4(col * 1.4, alpha);
  }
`;

const THANOS_REALITY_FRAG = `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uCharge;
  uniform vec3 uColor;
  uniform sampler2D uDistortTex;

  void main() {
    vec2 n = texture2D(uDistortTex, vUv * 1.2 + vec2(-uTime * 0.12, uTime * 0.18)).rg - 0.5;
    vec2 p = (vUv - 0.5) * 2.0 + n * 0.22;
    float r = length(p);
    float a = atan(p.y, p.x);

    float swirl = sin(r * 10.0 - uTime * 5.0 + a * 3.0);
    float ring = smoothstep(0.05, 0.0, abs(r - 0.72 + 0.05 * sin(a * 6.0 + uTime * 3.0)));
    float core = smoothstep(0.38, 0.02, r);

    vec3 prism = 0.5 + 0.5 * cos(uTime * 2.8 + a * 2.0 + r * 4.0 + vec3(0.0, 2.1, 4.2));
    vec3 col = mix(uColor, prism, 0.65 + uCharge * 0.25) * (1.25 + 0.3 * swirl);
    float alpha = clamp((core + ring + 0.35 * max(0.0, swirl) * (1.0 - r)) * smoothstep(1.0, 0.72, r), 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

const ARCANE_SIGIL_FRAG = `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uCharge;
  uniform vec3 uColor;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float a = atan(p.y, p.x);

    float ring = smoothstep(0.04, 0.0, abs(r - 0.72));
    float tri = smoothstep(0.035, 0.0, abs(r - (0.45 + 0.08 * cos(a * 3.0 + uTime * 2.0))));
    float core = smoothstep(0.24, 0.0, r);
    float alpha = clamp((ring + tri + core) * smoothstep(1.0, 0.8, r), 0.0, 1.0);
    gl_FragColor = vec4(uColor * (1.15 + uCharge * 0.4), alpha);
  }
`;

export interface GauntletVisualizerRig {
  root: THREE.Group;
  shaderQuad: THREE.Mesh;
  shaderMaterial: THREE.ShaderMaterial;
  flareSprite: THREE.Sprite;
  armorGroup: THREE.Group;
  infinityStonesGroup: THREE.Group;
  particles: THREE.Points;
  particlePositions: Float32Array;
  particleVelocities: Float32Array;
  particleColors: Float32Array;
  particleLife: Float32Array;
  setGauntlet: (id: GauntletId) => void;
  update: (
    dt: number,
    elapsed: number,
    palmPos: THREE.Vector3,
    cameraPos: THREE.Vector3,
    sign: HandSign,
    chargeRatio: number,
    visible: boolean,
  ) => void;
  dispose: () => void;
}

const PARTICLE_COUNT = 64;

const INFINITY_STONE_COLORS = [
  0xa855f7,
  0x3b82f6,
  0xef4444,
  0xf97316,
  0x22c55e,
  0xfacc15,
];

export function createGauntletVisualizer(isLeft: boolean): GauntletVisualizerRig {
  const root = new THREE.Group();
  const texLoader = new THREE.TextureLoader();

  const sparkTex = texLoader.load('/assets/textures/spark1.png');
  sparkTex.colorSpace = THREE.SRGBColorSpace;

  const flareTex = texLoader.load('/assets/textures/lensflare0.png');
  flareTex.colorSpace = THREE.SRGBColorSpace;

  const distortTex = texLoader.load('/assets/textures/waternormals.jpg');
  distortTex.wrapS = THREE.RepeatWrapping;
  distortTex.wrapT = THREE.RepeatWrapping;

  const shaderGeo = new THREE.PlaneGeometry(0.48, 0.48);
  const shaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCharge: { value: 0 },
      uColor: { value: new THREE.Color(0x22d3ee) },
      uDistortTex: { value: distortTex },
    },
    vertexShader: COMMON_VERT,
    fragmentShader: ARCANE_SIGIL_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const shaderQuad = new THREE.Mesh(shaderGeo, shaderMaterial);
  root.add(shaderQuad);

  // Additive lensflare sprite on palm center
  const flareMat = new THREE.SpriteMaterial({
    map: flareTex,
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flareSprite = new THREE.Sprite(flareMat);
  flareSprite.scale.set(0.32, 0.32, 1);
  root.add(flareSprite);

  // Multi-part Composite Metallic Armor Cuff, Forearm Vane & Knuckle Plates
  const armorGroup = new THREE.Group();
  const primaryMetalMat = new THREE.MeshPhysicalMaterial({
    color: 0xb91c1c,
    metalness: 0.92,
    roughness: 0.18,
    clearcoat: 0.55,
  });
  const trimMetalMat = new THREE.MeshPhysicalMaterial({
    color: 0xd4af37,
    metalness: 0.95,
    roughness: 0.16,
    anisotropy: 0.75,
  });

  const cuffGeo = new THREE.CylinderGeometry(0.088, 0.112, 0.24, 8);
  const cuff = new THREE.Mesh(cuffGeo, primaryMetalMat);
  cuff.position.set(0, -0.15, 0.04);
  armorGroup.add(cuff);

  const trimRingGeo = new THREE.TorusGeometry(0.098, 0.016, 8, 16);
  const trimRing = new THREE.Mesh(trimRingGeo, trimMetalMat);
  trimRing.rotation.x = Math.PI / 2;
  trimRing.position.set(0, -0.05, 0.04);
  armorGroup.add(trimRing);

  const knucklePlateGeo = new THREE.BoxGeometry(0.19, 0.065, 0.045);
  const knucklePlate = new THREE.Mesh(knucklePlateGeo, primaryMetalMat);
  knucklePlate.position.set(0, 0.04, 0.045);
  armorGroup.add(knucklePlate);

  const vaneGeo = new THREE.BoxGeometry(0.045, 0.14, 0.025);
  const vane = new THREE.Mesh(vaneGeo, trimMetalMat);
  vane.position.set(0, -0.16, 0.11);
  armorGroup.add(vane);

  root.add(armorGroup);

  // Thanos 6 Infinity Stones Cluster
  const infinityStonesGroup = new THREE.Group();
  const stoneGeo = new THREE.OctahedronGeometry(0.025, 0);
  const stoneMeshes: THREE.Mesh[] = [];
  INFINITY_STONE_COLORS.forEach((hex, idx) => {
    const mat = new THREE.MeshStandardMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: 2.3,
      roughness: 0.1,
      metalness: 0.2,
    });
    const stone = new THREE.Mesh(stoneGeo, mat);
    if (idx < 4) {
      stone.position.set(-0.06 + idx * 0.04, 0.06, 0.074);
    } else if (idx === 4) {
      stone.position.set(isLeft ? 0.092 : -0.092, -0.01, 0.066);
    } else {
      stone.position.set(0, 0.0, 0.082);
      stone.scale.setScalar(1.38);
    }
    infinityStonesGroup.add(stone);
    stoneMeshes.push(stone);
  });
  infinityStonesGroup.visible = false;
  armorGroup.add(infinityStonesGroup);

  // Per-Gauntlet GPU Particle System textured with downloaded spark1.png
  const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  const particleVelocities = new Float32Array(PARTICLE_COUNT * 3);
  const particleColors = new Float32Array(PARTICLE_COUNT * 3);
  const particleLife = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particleLife[i] = Math.random();
    particlePositions[i * 3 + 1] = -50;
  }

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(particlePositions, 3),
  );
  particleGeo.setAttribute(
    'color',
    new THREE.BufferAttribute(particleColors, 3),
  );

  const particleMat = new THREE.PointsMaterial({
    size: 0.095,
    map: sparkTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const particles = new THREE.Points(particleGeo, particleMat);
  particles.frustumCulled = false;

  let activeGauntlet: GauntletId = 'arcane';
  const scratchColor = new THREE.Color();
  const scratchColor2 = new THREE.Color();

  const setGauntlet = (id: GauntletId) => {
    activeGauntlet = id;
    const spec = getGauntletSpec(id);
    shaderMaterial.uniforms.uColor.value.setHex(spec.primaryHex);
    flareMat.color.setHex(spec.primaryHex);

    if (id === 'iron_man') {
      shaderMaterial.fragmentShader = ARC_REACTOR_FRAG;
      armorGroup.visible = true;
      infinityStonesGroup.visible = false;
      primaryMetalMat.color.setHex(0xb91c1c);
      trimMetalMat.color.setHex(0xfbbf24);
      particleMat.size = 0.095;
    } else if (id === 'doctor_strange') {
      shaderMaterial.fragmentShader = MANDALA_FRAG;
      armorGroup.visible = false;
      infinityStonesGroup.visible = false;
      particleMat.size = 0.11;
    } else if (id === 'doctor_doom') {
      shaderMaterial.fragmentShader = DOOM_PLASMA_FRAG;
      armorGroup.visible = true;
      infinityStonesGroup.visible = false;
      primaryMetalMat.color.setHex(0x334155);
      trimMetalMat.color.setHex(0x10b981);
      particleMat.size = 0.115;
    } else if (id === 'thanos') {
      shaderMaterial.fragmentShader = THANOS_REALITY_FRAG;
      armorGroup.visible = true;
      infinityStonesGroup.visible = true;
      primaryMetalMat.color.setHex(0xc99a2e);
      trimMetalMat.color.setHex(0xfde047);
      particleMat.size = 0.125;
    } else {
      shaderMaterial.fragmentShader = ARCANE_SIGIL_FRAG;
      armorGroup.visible = false;
      infinityStonesGroup.visible = false;
      particleMat.size = 0.088;
    }
    shaderMaterial.needsUpdate = true;
  };

  setGauntlet('arcane');

  const update = (
    dt: number,
    elapsed: number,
    palmPos: THREE.Vector3,
    cameraPos: THREE.Vector3,
    sign: HandSign,
    chargeRatio: number,
    visible: boolean,
  ) => {
    root.visible = visible;
    particles.visible = visible;
    if (!visible) return;

    root.position.copy(palmPos);
    root.lookAt(cameraPos);

    shaderMaterial.uniforms.uTime.value = elapsed;
    shaderMaterial.uniforms.uCharge.value = chargeRatio;
    const scaleBoost = 1 + chargeRatio * 0.45 + (sign !== 'none' ? 0.12 : 0);
    shaderQuad.scale.setScalar(scaleBoost);

    const flareScale = 0.28 + chargeRatio * 0.35 + Math.sin(elapsed * 9) * 0.04;
    flareSprite.scale.set(flareScale, flareScale, 1);
    flareMat.opacity = 0.42 + chargeRatio * 0.4;

    if (infinityStonesGroup.visible) {
      stoneMeshes.forEach((st, idx) => {
        st.rotation.y = elapsed * 2.5 + idx;
      });
    }

    const spec = getGauntletSpec(activeGauntlet);
    scratchColor.setHex(spec.primaryHex);
    scratchColor2.setHex(spec.secondaryHex);

    const posAttr = particleGeo.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = particleGeo.getAttribute('color') as THREE.BufferAttribute;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particleLife[i] -= dt * (activeGauntlet === 'iron_man' ? 2.1 : 1.35);
      if (particleLife[i] <= 0) {
        particleLife[i] = 0.65 + Math.random() * 0.45;
        const angle = Math.random() * Math.PI * 2;
        const rad = 0.05 + Math.random() * 0.14;
        particlePositions[i * 3] = palmPos.x + Math.cos(angle) * rad;
        particlePositions[i * 3 + 1] = palmPos.y + Math.sin(angle) * rad;
        particlePositions[i * 3 + 2] = palmPos.z + (Math.random() - 0.5) * 0.08;

        if (activeGauntlet === 'iron_man') {
          particleVelocities[i * 3] = Math.cos(angle) * 0.55;
          particleVelocities[i * 3 + 1] = Math.sin(angle) * 0.45 - 0.35;
          particleVelocities[i * 3 + 2] = -0.75 - Math.random() * 0.6;
        } else if (activeGauntlet === 'thanos') {
          particleVelocities[i * 3] = -Math.sin(angle) * 0.65;
          particleVelocities[i * 3 + 1] = Math.cos(angle) * 0.65 + 0.2;
          particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
        } else if (activeGauntlet === 'doctor_doom') {
          particleVelocities[i * 3] = (Math.random() - 0.5) * 0.35;
          particleVelocities[i * 3 + 1] = 0.45 + Math.random() * 0.55;
          particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
        } else {
          particleVelocities[i * 3] = -Math.sin(angle) * 0.48;
          particleVelocities[i * 3 + 1] = Math.cos(angle) * 0.48;
          particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
        }

        if (activeGauntlet === 'thanos') {
          const stoneHex = INFINITY_STONE_COLORS[i % INFINITY_STONE_COLORS.length];
          scratchColor.setHex(stoneHex);
          particleColors[i * 3] = scratchColor.r;
          particleColors[i * 3 + 1] = scratchColor.g;
          particleColors[i * 3 + 2] = scratchColor.b;
        } else {
          const mixT = Math.random();
          particleColors[i * 3] = THREE.MathUtils.lerp(
            scratchColor.r,
            scratchColor2.r,
            mixT,
          );
          particleColors[i * 3 + 1] = THREE.MathUtils.lerp(
            scratchColor.g,
            scratchColor2.g,
            mixT,
          );
          particleColors[i * 3 + 2] = THREE.MathUtils.lerp(
            scratchColor.b,
            scratchColor2.b,
            mixT,
          );
        }
      } else {
        particlePositions[i * 3] += particleVelocities[i * 3] * dt;
        particlePositions[i * 3 + 1] += particleVelocities[i * 3 + 1] * dt;
        particlePositions[i * 3 + 2] += particleVelocities[i * 3 + 2] * dt;
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  };

  const dispose = () => {
    sparkTex.dispose();
    flareTex.dispose();
    distortTex.dispose();
    flareMat.dispose();
    shaderGeo.dispose();
    shaderMaterial.dispose();
    cuffGeo.dispose();
    trimRingGeo.dispose();
    knucklePlateGeo.dispose();
    vaneGeo.dispose();
    primaryMetalMat.dispose();
    trimMetalMat.dispose();
    stoneGeo.dispose();
    stoneMeshes.forEach((s) => (s.material as THREE.Material).dispose());
    particleGeo.dispose();
    particleMat.dispose();
  };

  return {
    root,
    shaderQuad,
    shaderMaterial,
    flareSprite,
    armorGroup,
    infinityStonesGroup,
    particles,
    particlePositions,
    particleVelocities,
    particleColors,
    particleLife,
    setGauntlet,
    update,
    dispose,
  };
}
