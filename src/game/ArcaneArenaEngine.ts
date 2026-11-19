import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ArcaneAudio } from '../audio/ArcaneAudio';
import { RemoteCastEvent } from '../net/MultiplayerClient';
import {
  CameraStatus,
  GameHudSnapshot,
  GamePhase,
  GauntletId,
  HandSign,
  HandSnapshot,
  InputMode,
  MatchMode,
  PlayerInputState,
  RoomPlayerState,
  SpellType,
  ViewMode,
} from '../types/game';
import {
  createGauntletVisualizer,
  GAUNTLET_CATALOG,
  GauntletVisualizerRig,
  getGauntletSpec,
} from './gauntlets';
import {
  createEnemyModel,
  createHandGauntlet,
  createInteractiveCrystal,
  createRemoteAvatar,
  createSanctumArena,
  CrystalKind,
  EnemyKind,
  EnemyRig,
  getHandBones,
  HandGauntletRig,
  InteractiveCrystalRig,
  RemoteAvatarRig,
  SanctumRig,
} from './models';
import { createProceduralTextures, ProceduralTextures } from './textures';

// Pre-allocated module-scope scratch objects (Zero GC in 60fps loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

const BEST_SCORE_KEY = 'aether_sigil_best_score_v1';
const BANK_POINTS_KEY = 'aether_sigil_bank_points_v1';
const UNLOCKED_GAUNTLETS_KEY = 'aether_sigil_unlocked_gauntlets_v1';
const EQUIPPED_GAUNTLET_KEY = 'aether_sigil_equipped_gauntlet_v1';

const INFINITY_HUES = [0xa855f7, 0x3b82f6, 0xef4444, 0xf97316, 0x22c55e, 0xfacc15];

const SIGN_COLORS: Record<HandSign, number> = {
  none: 0x38bdf8,
  open_palm: 0x34d399,
  fist: 0xf97316,
  point: 0x22d3ee,
  peace: 0xfbbf24,
  pinch: 0xc084fc,
  thumbs_up: 0x4ade80,
};

interface ActiveEnemy {
  id: number;
  kind: EnemyKind;
  rig: EnemyRig;
  pos: THREE.Vector3;
  hp: number;
  maxHp: number;
  phaseOffset: number;
  strafeDir: number;
  attackCooldown: number;
  windupTimer: number;
  hitFlashTimer: number;
  spawnAnimTimer: number;
  radius: number;
  scoreValue: number;
}

interface ActiveProjectile {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fromPlayer: boolean;
  remoteOwnerId: string | null;
  homingTargetId: number | null;
  damage: number;
  splashRadius: number;
  life: number;
  colorHex: number;
}

interface ActiveCrystal {
  id: number;
  kind: CrystalKind;
  rig: InteractiveCrystalRig;
  pos: THREE.Vector3;
  life: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxScale: number;
}

interface BeamEffect {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  baseScaleXZ: number;
}

interface SparkParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

interface RemoteAvatarEntry {
  rig: RemoteAvatarRig;
  data: RoomPlayerState;
  targetPos: THREE.Vector3;
}

export interface EngineMultiplayerHooks {
  onSendPlayerUpdate: (payload: Omit<RoomPlayerState, 'id' | 'name' | 'maxHp'>) => void;
  onSendCastSpell: (
    spell: string,
    origin: [number, number, number],
    vel: [number, number, number],
  ) => void;
  onSendPvpDamage: (targetId: string, damage: number) => void;
  onSendCoopEvent: (event: string, payload: Record<string, unknown>) => void;
}

export class ArcaneArenaEngine {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly isSoftwareGl: boolean;
  private readonly textures: ProceduralTextures;
  private readonly sanctum: SanctumRig;
  private readonly leftGauntlet: HandGauntletRig;
  private readonly rightGauntlet: HandGauntletRig;
  private readonly leftVisualizer: GauntletVisualizerRig;
  private readonly rightVisualizer: GauntletVisualizerRig;
  private readonly reticleGroup: THREE.Group;
  private readonly reticleRingMat: THREE.MeshBasicMaterial;
  private readonly audio: ArcaneAudio;

  private readonly sparkPool: SparkParticle[] = [];
  private readonly sparkInstanced: THREE.InstancedMesh;

  private enemies: ActiveEnemy[] = [];
  private projectiles: ActiveProjectile[] = [];
  private crystals: ActiveCrystal[] = [];
  private shockwaves: ShockwaveRing[] = [];
  private beams: BeamEffect[] = [];
  private remoteAvatars = new Map<string, RemoteAvatarEntry>();

  private nextEnemyId = 1;
  private nextCrystalId = 1;
  private crystalSpawnTimer = 6.5;

  // Shared projectile geometries & downloaded flare texture
  private readonly projectileFlareTex: THREE.Texture;
  private readonly boltGeo = new THREE.OctahedronGeometry(0.16, 0);
  private readonly starGeo = new THREE.IcosahedronGeometry(0.18, 0);
  private readonly meteorGeo = new THREE.DodecahedronGeometry(0.36, 0);
  private readonly enemyOrbGeo = new THREE.SphereGeometry(0.2, 12, 12);
  private readonly ringGeo = new THREE.TorusGeometry(1, 0.055, 8, 36);
  private readonly beamGeo = new THREE.CylinderGeometry(0.42, 0.42, 1, 14, 1, true);

  private frameId = 0;
  private disposed = false;
  private readonly clock = new THREE.Clock();

  // Game & progression state
  private phase: GamePhase = 'title';
  private viewMode: ViewMode = 'vr';
  private inputMode: InputMode = 'fallback';
  private matchMode: MatchMode = 'solo';
  private isRoomHost = true;
  private selfPlayerId: string | null = null;
  private cameraStatus: CameraStatus = 'idle';
  private cameraError: string | null = null;

  private equippedGauntlet: GauntletId = 'arcane';
  private unlockedGauntlets: GauntletId[] = ['arcane'];
  private bankPoints = 0;

  private health = 100;
  private readonly maxHealth = 100;
  private resonance = 35;
  private wave = 1;
  private waveSpawnQueue: EnemyKind[] = [];
  private spawnTimer = 0;
  private waveClearDelay = 0;
  private score = 0;
  private bestScore = 0;
  private combo = 0;
  private comboTimer = 0;
  private kills = 0;
  private parries = 0;
  private casts = 0;
  private lastCastLabel: string | null = null;
  private lastCastTimer = 0;
  private waveBanner: string | null = null;
  private waveBannerTimer = 0;
  private chronoSlowTimer = 0;
  private recoilRight = 0;
  private recoilLeft = 0;

  private cooldowns = {
    astral_bolt: 0,
    twin_starfire: 0,
    solar_shockwave: 0,
    meteor_hammer: 0,
    sanctum_mend: 0,
  };

  private hitstopTimer = 0;
  private cameraShake = 0;
  private playerOffsetX = 0;
  private playerOffsetY = 0;
  private lastHudEmit = 0;
  private lastNetEmit = 0;

  private readonly inputRef: { current: PlayerInputState };
  private readonly onHudUpdate: (snapshot: GameHudSnapshot) => void;
  private mpHooks: EngineMultiplayerHooks | null = null;

  private readonly vrBgColor = new THREE.Color(0x090d1a);
  private readonly vrFog = new THREE.FogExp2(0x090d1a, 0.022);

  constructor(
    container: HTMLElement,
    inputRef: { current: PlayerInputState },
    audio: ArcaneAudio,
    onHudUpdate: (snapshot: GameHudSnapshot) => void,
  ) {
    this.container = container;
    this.inputRef = inputRef;
    this.audio = audio;
    this.onHudUpdate = onHudUpdate;

    this.loadPersistence();

    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );

    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
    container.appendChild(canvas);

    this.scene = new THREE.Scene();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 140);
    this.camera.position.set(0, 1.35, 5.2);
    this.camera.lookAt(0, 0.4, -8);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04,
    ).texture;
    pmremGenerator.dispose();

    const hemi = new THREE.HemisphereLight(0x7dd3fc, 0x1e1b4b, 0.9);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.1);
    keyLight.position.set(8, 15, 7);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 48;
    const d = 16;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.05);
    rimLight.position.set(-10, 6, -18);
    this.scene.add(rimLight);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    const texLoader = new THREE.TextureLoader();
    this.projectileFlareTex = texLoader.load('/assets/textures/lensflare3.png');
    this.projectileFlareTex.colorSpace = THREE.SRGBColorSpace;

    this.sanctum = createSanctumArena(this.textures, this.isSoftwareGl);
    this.scene.add(this.sanctum.root);

    this.leftGauntlet = createHandGauntlet(true);
    this.rightGauntlet = createHandGauntlet(false);
    this.scene.add(this.leftGauntlet.root);
    this.scene.add(this.rightGauntlet.root);

    // Gauntlet Visualizer System (Shaders, Armor & Per-Hand Particles)
    this.leftVisualizer = createGauntletVisualizer(true);
    this.rightVisualizer = createGauntletVisualizer(false);
    this.scene.add(this.leftVisualizer.root, this.leftVisualizer.particles);
    this.scene.add(this.rightVisualizer.root, this.rightVisualizer.particles);
    this.applyGauntletVisuals(this.equippedGauntlet);

    this.reticleGroup = new THREE.Group();
    this.reticleRingMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    const outerReticle = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.22, 24),
      this.reticleRingMat,
    );
    const innerReticle = new THREE.Mesh(
      new THREE.RingGeometry(0.03, 0.055, 16),
      this.reticleRingMat,
    );
    this.reticleGroup.add(outerReticle, innerReticle);
    this.reticleGroup.position.set(0, 0.6, -6);
    this.scene.add(this.reticleGroup);

    const sparkCount = 160;
    const sparkGeo = new THREE.OctahedronGeometry(0.09, 0);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
    });
    this.sparkInstanced = new THREE.InstancedMesh(sparkGeo, sparkMat, sparkCount);
    this.sparkInstanced.frustumCulled = false;
    for (let i = 0; i < sparkCount; i++) {
      this.sparkPool.push({
        active: false,
        pos: new THREE.Vector3(0, -100, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        scale: 0,
        color: new THREE.Color(0x22d3ee),
      });
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.sparkInstanced.setMatrixAt(i, _dummy.matrix);
      this.sparkInstanced.setColorAt(i, _color.setHex(0x22d3ee));
    }
    this.sparkInstanced.instanceMatrix.needsUpdate = true;
    if (this.sparkInstanced.instanceColor) {
      this.sparkInstanced.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.sparkInstanced);

    this.applyViewMode('vr');

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);
    this.clock.start();
    this.emitHudSnapshot(true);
    this.tick();
  }

  private loadPersistence(): void {
    try {
      const best = localStorage.getItem(BEST_SCORE_KEY);
      if (best) this.bestScore = parseInt(best, 10) || 0;
      const bank = localStorage.getItem(BANK_POINTS_KEY);
      if (bank) this.bankPoints = parseInt(bank, 10) || 0;
      const unlockedRaw = localStorage.getItem(UNLOCKED_GAUNTLETS_KEY);
      if (unlockedRaw) {
        const parsed = JSON.parse(unlockedRaw) as GauntletId[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.unlockedGauntlets = Array.from(new Set(['arcane', ...parsed]));
        }
      }
      const equipped = localStorage.getItem(EQUIPPED_GAUNTLET_KEY) as GauntletId | null;
      if (equipped && this.unlockedGauntlets.includes(equipped)) {
        this.equippedGauntlet = equipped;
      }
    } catch {
      // ignore storage errors
    }
  }

  private savePersistence(): void {
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(this.bestScore));
      localStorage.setItem(BANK_POINTS_KEY, String(this.bankPoints));
      localStorage.setItem(
        UNLOCKED_GAUNTLETS_KEY,
        JSON.stringify(this.unlockedGauntlets),
      );
      localStorage.setItem(EQUIPPED_GAUNTLET_KEY, this.equippedGauntlet);
    } catch {
      // ignore storage errors
    }
  }

  public setMultiplayerHooks(hooks: EngineMultiplayerHooks): void {
    this.mpHooks = hooks;
  }

  public setMatchContext(
    mode: MatchMode,
    selfId: string | null,
    isHost: boolean,
  ): void {
    this.matchMode = mode;
    this.selfPlayerId = selfId;
    this.isRoomHost = isHost;
    this.emitHudSnapshot(true);
  }

  public syncRemotePlayers(players: RoomPlayerState[]): void {
    const activeIds = new Set<string>();
    for (const p of players) {
      if (p.id === this.selfPlayerId) continue;
      activeIds.add(p.id);
      let entry = this.remoteAvatars.get(p.id);
      if (!entry) {
        const rig = createRemoteAvatar(p.gauntletId);
        const z = this.matchMode === 'pvp' ? -9.5 : 3.4;
        const x = this.matchMode === 'pvp' ? -p.x : p.x;
        rig.root.position.set(x, -1.3, z);
        if (this.matchMode === 'coop') {
          rig.root.rotation.y = 0;
        } else {
          rig.root.rotation.y = Math.PI;
        }
        this.scene.add(rig.root);
        entry = {
          rig,
          data: p,
          targetPos: new THREE.Vector3(x, -1.3 + p.y * 0.4, z),
        };
        this.remoteAvatars.set(p.id, entry);
      } else {
        if (entry.data.gauntletId !== p.gauntletId) {
          entry.rig.setGauntletColor(p.gauntletId);
        }
        entry.data = p;
        const z = this.matchMode === 'pvp' ? -9.5 : 3.4;
        const x = this.matchMode === 'pvp' ? -p.x : p.x;
        entry.targetPos.set(x, -1.3 + p.y * 0.4, z);
        entry.rig.shieldMesh.visible = p.shieldActive;
      }
    }

    for (const [id, entry] of this.remoteAvatars.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(entry.rig.root);
        entry.rig.dispose();
        this.remoteAvatars.delete(id);
      }
    }
  }

  public spawnRemoteCast(ev: RemoteCastEvent): void {
    if (this.phase !== 'playing') return;
    const avatar = this.remoteAvatars.get(ev.playerId);
    const spec = getGauntletSpec(ev.gauntletId);
    const origin = avatar
      ? avatar.rig.root.position.clone().add(new THREE.Vector3(0, 1.0, 0))
      : new THREE.Vector3(...ev.origin);

    const vel = new THREE.Vector3(...ev.vel);
    const isPvpEnemyShot = this.matchMode === 'pvp';
    if (isPvpEnemyShot) {
      // Mirror velocity toward local player in PvP
      vel.set(-vel.x, vel.y, Math.abs(vel.z) * 0.85);
    }

    const geo =
      ev.spell === 'meteor_hammer'
        ? this.meteorGeo
        : ev.spell === 'twin_starfire'
          ? this.starGeo
          : this.boltGeo;
    this.spawnProjectile(
      origin,
      vel,
      !isPvpEnemyShot,
      ev.playerId,
      null,
      14,
      0,
      spec.primaryHex,
      geo,
    );
  }

  public applyPvpHit(damage: number): void {
    if (this.phase !== 'playing') return;
    if (this.inputRef.current.shieldActive) {
      this.parries += 1;
      this.resonance = Math.min(100, this.resonance + 18);
      this.audio.playParry();
      this.lastCastLabel = 'PvP Ward Parry!';
      this.lastCastTimer = 1.1;
      return;
    }
    this.health = Math.max(0, this.health - damage);
    this.cameraShake = Math.max(this.cameraShake, 0.55);
    this.audio.playPlayerDamage();
    if (this.health <= 0) {
      this.triggerGameOver();
    }
    this.emitHudSnapshot(true);
  }

  public handleCoopEvent(event: string, payload: Record<string, unknown>): void {
    if (event === 'vitality_heal') {
      const heal = Number(payload.amount) || 15;
      this.health = Math.min(this.maxHealth, this.health + heal);
      this.lastCastLabel = 'Ally Vitality Conduit!';
      this.lastCastTimer = 1.4;
      this.audio.playSpell('sanctum_mend', this.equippedGauntlet);
    } else if (event === 'chrono_slow') {
      this.chronoSlowTimer = Math.max(this.chronoSlowTimer, 4.5);
      this.lastCastLabel = 'Chrono Anchor Active!';
      this.lastCastTimer = 1.4;
    } else if (event === 'wave_sync' && !this.isRoomHost) {
      const nextWave = Number(payload.wave) || this.wave;
      if (nextWave > this.wave) {
        this.wave = nextWave;
        this.queueWave(nextWave);
      }
    }
  }

  public buyOrEquipGauntlet(id: GauntletId): boolean {
    if (this.unlockedGauntlets.includes(id)) {
      this.equippedGauntlet = id;
      this.applyGauntletVisuals(id);
      this.savePersistence();
      this.emitHudSnapshot(true);
      return true;
    }
    const spec = getGauntletSpec(id);
    if (this.bankPoints >= spec.cost) {
      this.bankPoints -= spec.cost;
      this.unlockedGauntlets = [...this.unlockedGauntlets, id];
      this.equippedGauntlet = id;
      this.applyGauntletVisuals(id);
      this.savePersistence();
      this.audio.playWaveClear();
      this.emitHudSnapshot(true);
      return true;
    }
    return false;
  }

  private applyGauntletVisuals(id: GauntletId): void {
    const spec = getGauntletSpec(id);
    this.leftVisualizer.setGauntlet(id);
    this.rightVisualizer.setGauntlet(id);

    this.rightGauntlet.accentMaterial.color.setHex(spec.primaryHex);
    this.rightGauntlet.accentMaterial.emissive.setHex(spec.primaryHex);
    this.leftGauntlet.accentMaterial.color.setHex(spec.secondaryHex);
    this.leftGauntlet.accentMaterial.emissive.setHex(spec.secondaryHex);

    if (this.leftGauntlet.wardMaterial) {
      this.leftGauntlet.wardMaterial.color.setHex(spec.secondaryHex);
      this.leftGauntlet.wardMaterial.emissive.setHex(spec.secondaryHex);
    }
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
  };

  private handleContextRestored = (): void => {
    this.clock.start();
    this.tick();
  };

  private handleResize = (): void => {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    this.applyViewMode(mode);
    this.emitHudSnapshot(true);
  }

  private applyViewMode(mode: ViewMode): void {
    if (mode === 'ar') {
      this.scene.background = null;
      this.scene.fog = null;
      this.renderer.setClearColor(0x000000, 0);
      this.sanctum.vrOnlyGroup.visible = false;
      this.sanctum.arDaisGroup.visible = true;
    } else {
      this.scene.background = this.vrBgColor;
      this.scene.fog = this.vrFog;
      this.renderer.setClearColor(0x090d1a, 1);
      this.sanctum.vrOnlyGroup.visible = true;
      this.sanctum.arDaisGroup.visible = true;
    }
  }

  public setInputMeta(
    inputMode: InputMode,
    cameraStatus: CameraStatus,
    cameraError: string | null,
  ): void {
    this.inputMode = inputMode;
    this.cameraStatus = cameraStatus;
    this.cameraError = cameraError;
    this.emitHudSnapshot(true);
  }

  public startNewGame(): void {
    this.clearCombatEntities();
    this.health = this.maxHealth;
    this.resonance = 40;
    this.wave = 1;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.kills = 0;
    this.parries = 0;
    this.casts = 0;
    this.chronoSlowTimer = 0;
    this.crystalSpawnTimer = 5.5;
    this.lastCastLabel = null;
    this.cooldowns = {
      astral_bolt: 0,
      twin_starfire: 0,
      solar_shockwave: 0,
      meteor_hammer: 0,
      sanctum_mend: 0,
    };
    this.playerOffsetX = 0;
    this.playerOffsetY = 0;
    this.phase = 'playing';

    if (this.matchMode === 'pvp') {
      this.waveSpawnQueue = [];
      this.waveBanner = 'PvP Gauntlet Duel';
      this.waveBannerTimer = 2.6;
    } else {
      this.queueWave(1);
    }
    this.emitHudSnapshot(true);
  }

  public setPhase(phase: GamePhase): void {
    this.phase = phase;
    this.emitHudSnapshot(true);
  }

  public getPhase(): GamePhase {
    return this.phase;
  }

  private clearCombatEntities(): void {
    this.enemies.forEach((e) => this.scene.remove(e.rig.root));
    this.enemies = [];
    this.projectiles.forEach((p) => this.disposeProjectileMesh(p.mesh));
    this.projectiles = [];
    this.crystals.forEach((c) => {
      this.scene.remove(c.rig.root);
      c.rig.dispose();
    });
    this.crystals = [];
    this.shockwaves.forEach((s) => {
      this.scene.remove(s.mesh);
      (s.mesh.material as THREE.Material).dispose();
    });
    this.shockwaves = [];
    this.beams.forEach((b) => {
      this.scene.remove(b.mesh);
      (b.mesh.material as THREE.Material).dispose();
    });
    this.beams = [];
  }

  private queueWave(waveNum: number): void {
    const queue: EnemyKind[] = [];
    const wispCount = 3 + waveNum * 2;
    const sentinelCount = waveNum >= 2 ? Math.floor(waveNum * 0.85) : 0;
    const spireCount = waveNum % 3 === 0 ? 1 : 0;

    for (let i = 0; i < wispCount; i++) queue.push('wisp');
    for (let i = 0; i < sentinelCount; i++) queue.push('sentinel');
    for (let i = 0; i < spireCount; i++) queue.push('spire');

    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }

    this.waveSpawnQueue = queue;
    this.spawnTimer = 0.4;
    this.waveBanner =
      spireCount > 0 ? `Wave ${waveNum} · Elite Aether Spire` : `Wave ${waveNum}`;
    this.waveBannerTimer = 2.6;
  }

  private spawnEnemy(kind: EnemyKind): void {
    const rig = createEnemyModel(kind, this.textures.contactShadow);
    const angle = (Math.random() - 0.5) * Math.PI * 0.75;
    const dist = kind === 'spire' ? 14.5 : 13 + Math.random() * 4.5;
    const x = Math.sin(angle) * dist;
    const z = -Math.cos(angle) * dist - 2;
    const y = kind === 'wisp' ? 0.6 + Math.random() * 1.4 : kind === 'sentinel' ? 0.35 : 1.5;

    rig.root.position.set(x, y, z);
    rig.root.scale.setScalar(0.05);
    this.scene.add(rig.root);

    // Portal rift spawn visual
    this.spawnShockwave(new THREE.Vector3(x, y, z), 0xa855f7, 2.4);

    const scaleBoost = 1 + (this.wave - 1) * 0.14;
    const hp =
      kind === 'wisp'
        ? Math.round(28 * scaleBoost)
        : kind === 'sentinel'
          ? Math.round(75 * scaleBoost)
          : Math.round(190 * scaleBoost);

    this.enemies.push({
      id: this.nextEnemyId++,
      kind,
      rig,
      pos: rig.root.position,
      hp,
      maxHp: hp,
      phaseOffset: Math.random() * Math.PI * 2,
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      attackCooldown:
        kind === 'wisp'
          ? 2.2 + Math.random() * 1.6
          : kind === 'sentinel'
            ? 2.8 + Math.random() * 1.4
            : 2.4,
      windupTimer: 0,
      hitFlashTimer: 0,
      spawnAnimTimer: 0.45,
      radius: kind === 'spire' ? 1.45 : kind === 'sentinel' ? 0.95 : 0.65,
      scoreValue: kind === 'spire' ? 650 : kind === 'sentinel' ? 240 : 110,
    });
  }

  private spawnCrystal(): void {
    const kinds: CrystalKind[] = ['overcharge', 'chrono', 'vitality'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const rig = createInteractiveCrystal(kind);
    const x = (Math.random() - 0.5) * 9.5;
    const y = 0.6 + Math.random() * 1.6;
    const z = -5.5 - Math.random() * 4.5;
    rig.root.position.set(x, y, z);
    this.scene.add(rig.root);

    this.crystals.push({
      id: this.nextCrystalId++,
      kind,
      rig,
      pos: rig.root.position,
      life: 14,
    });
  }

  private tick = (): void => {
    if (this.disposed) return;

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    const elapsed = this.clock.elapsedTime;

    this.updateAmbientSanctum(elapsed, dt);

    if (this.phase === 'title') {
      this.updateTitleCamera(elapsed, dt);
      this.leftGauntlet.root.visible = false;
      this.rightGauntlet.root.visible = false;
      this.leftVisualizer.update(dt, elapsed, _v1, this.camera.position, 'none', 0, false);
      this.rightVisualizer.update(dt, elapsed, _v1, this.camera.position, 'none', 0, false);
      this.reticleGroup.visible = false;
    } else if (this.phase === 'playing') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      } else {
        this.updatePlaying(elapsed, dt);
      }
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateAmbientSanctum(elapsed: number, dt: number): void {
    this.sanctum.astrolabeRings.forEach((ring, idx) => {
      ring.rotation.y += dt * (idx % 2 === 0 ? 0.14 : -0.19);
      ring.rotation.z += dt * 0.05 * (idx + 1);
    });

    this.sanctum.braziers.forEach((brazier, idx) => {
      const crystal = brazier.children[1];
      if (crystal) {
        crystal.rotation.y = elapsed * 0.9 + idx;
        crystal.position.y = 0.85 + Math.sin(elapsed * 2 + idx) * 0.08;
      }
    });

    const count = this.sanctum.motes.count;
    for (let i = 0; i < count; i++) {
      const bx = this.sanctum.moteBasePositions[i * 3];
      const by = this.sanctum.moteBasePositions[i * 3 + 1];
      const bz = this.sanctum.moteBasePositions[i * 3 + 2];
      const ph = this.sanctum.motePhases[i];
      _dummy.position.set(
        bx + Math.sin(elapsed * 0.45 + ph) * 0.4,
        by + Math.cos(elapsed * 0.6 + ph) * 0.35,
        bz + Math.sin(elapsed * 0.35 + ph * 1.3) * 0.4,
      );
      _dummy.rotation.set(elapsed + ph, elapsed * 0.7, 0);
      _dummy.scale.setScalar(0.75 + Math.sin(elapsed * 1.5 + ph) * 0.25);
      _dummy.updateMatrix();
      this.sanctum.motes.setMatrixAt(i, _dummy.matrix);
    }
    this.sanctum.motes.instanceMatrix.needsUpdate = true;
  }

  private updateTitleCamera(elapsed: number, dt: number): void {
    const targetX = Math.sin(elapsed * 0.22) * 3.4;
    const targetZ = 5.4 + Math.cos(elapsed * 0.22) * 1.4;
    const damp = 1 - Math.exp(-3 * dt);
    this.camera.position.x += (targetX - this.camera.position.x) * damp;
    this.camera.position.y += (1.75 - this.camera.position.y) * damp;
    this.camera.position.z += (targetZ - this.camera.position.z) * damp;
    this.camera.lookAt(0, 0.35, -7.5);
  }

  private updatePlaying(elapsed: number, dt: number): void {
    const input = this.inputRef.current;

    const surgeMultiplier = input.manaSurgeActive ? 2.1 : 1.0;
    (Object.keys(this.cooldowns) as Array<keyof typeof this.cooldowns>).forEach(
      (key) => {
        if (this.cooldowns[key] > 0) {
          this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt * surgeMultiplier);
        }
      },
    );

    if (this.chronoSlowTimer > 0) {
      this.chronoSlowTimer = Math.max(0, this.chronoSlowTimer - dt);
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    if (this.lastCastTimer > 0) {
      this.lastCastTimer -= dt;
      if (this.lastCastTimer <= 0) this.lastCastLabel = null;
    }
    if (this.waveBannerTimer > 0) {
      this.waveBannerTimer -= dt;
      if (this.waveBannerTimer <= 0) this.waveBanner = null;
    }

    this.recoilRight = Math.max(0, this.recoilRight - dt * 4.5);
    this.recoilLeft = Math.max(0, this.recoilLeft - dt * 4.5);

    const targetPlayerX = THREE.MathUtils.clamp(input.strafeX * 2.6, -2.6, 2.6);
    const targetPlayerY = THREE.MathUtils.clamp(input.strafeY * 0.65, -0.5, 0.7);
    const camDamp = 1 - Math.exp(-9 * dt);
    this.playerOffsetX += (targetPlayerX - this.playerOffsetX) * camDamp;
    this.playerOffsetY += (targetPlayerY - this.playerOffsetY) * camDamp;

    this.cameraShake = Math.max(0, this.cameraShake - dt * 2.8);
    const shakeAmp = this.cameraShake * this.cameraShake * 0.28;
    const shakeX = (Math.random() - 0.5) * shakeAmp;
    const shakeY = (Math.random() - 0.5) * shakeAmp;

    this.camera.position.set(
      this.playerOffsetX + shakeX,
      1.35 + this.playerOffsetY + shakeY,
      5.2,
    );
    this.camera.lookAt(
      this.playerOffsetX * 0.4 + input.aimX * 1.8,
      0.5 + input.aimY * 1.1,
      -8,
    );

    this.reticleGroup.visible = true;
    const aimWorldX = this.playerOffsetX * 0.5 + input.aimX * 6.5;
    const aimWorldY = 0.65 + this.playerOffsetY * 0.4 + input.aimY * 3.8;
    this.reticleGroup.position.set(aimWorldX, aimWorldY, -6.5);
    this.reticleGroup.lookAt(this.camera.position);
    this.reticleGroup.rotation.z = elapsed * 1.4;
    const reticleColor =
      this.equippedGauntlet === 'arcane'
        ? SIGN_COLORS[input.right.sign] ?? 0x22d3ee
        : getGauntletSpec(this.equippedGauntlet).primaryHex;
    this.reticleRingMat.color.setHex(reticleColor);

    this.updateGauntlet(
      this.leftGauntlet,
      this.leftVisualizer,
      input.left,
      true,
      input.shieldActive,
      input.strafeX,
      input.strafeY,
      input.manaSurgeActive ? 0.85 : 0.1,
      this.recoilLeft,
      elapsed,
      dt,
    );
    this.updateGauntlet(
      this.rightGauntlet,
      this.rightVisualizer,
      input.right,
      false,
      false,
      input.aimX,
      input.aimY,
      input.meteorChargeRatio,
      this.recoilRight,
      elapsed,
      dt,
    );

    if (input.queuedSpell) {
      this.tryCastSpell(input.queuedSpell, aimWorldX, aimWorldY);
      input.queuedSpell = null;
    }

    if (input.manaSurgeActive) {
      this.resonance = Math.min(100, this.resonance + dt * 7.5);
    }

    // Interactive Crystals spawning & updates
    this.crystalSpawnTimer -= dt;
    if (this.crystalSpawnTimer <= 0 && this.crystals.length < 2) {
      this.spawnCrystal();
      this.crystalSpawnTimer = 9.0;
    }
    this.updateCrystals(elapsed, dt, input.telekinesisActive, aimWorldX, aimWorldY);

    // Wave spawning (disabled in PvP mode)
    if (this.matchMode !== 'pvp') {
      if (this.waveSpawnQueue.length > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.enemies.length < 9) {
          const nextKind = this.waveSpawnQueue.shift()!;
          this.spawnEnemy(nextKind);
          this.spawnTimer = Math.max(0.55, 1.45 - this.wave * 0.08);
        }
      } else if (this.enemies.length === 0) {
        this.waveClearDelay += dt;
        if (this.waveClearDelay >= 1.6) {
          this.waveClearDelay = 0;
          this.wave += 1;
          this.health = Math.min(this.maxHealth, this.health + 12);
          this.audio.playWaveClear();
          this.queueWave(this.wave);
          if (this.matchMode === 'coop' && this.isRoomHost) {
            this.mpHooks?.onSendCoopEvent('wave_sync', { wave: this.wave });
          }
        }
      }
    }

    const enemyDt = this.chronoSlowTimer > 0 ? dt * 0.45 : dt;
    this.updateEnemies(elapsed, enemyDt, input.telekinesisActive, aimWorldX, aimWorldY);
    this.updateProjectiles(dt, enemyDt, input.shieldActive);
    this.updateRemoteAvatars(elapsed, dt);
    this.updateEffects(dt);

    // Emit player state to multiplayer server at ~18Hz
    if (this.matchMode !== 'solo' && elapsed - this.lastNetEmit >= 0.055) {
      this.lastNetEmit = elapsed;
      this.mpHooks?.onSendPlayerUpdate({
        gauntletId: this.equippedGauntlet,
        x: Number(this.playerOffsetX.toFixed(2)),
        y: Number(this.playerOffsetY.toFixed(2)),
        aimX: Number(input.aimX.toFixed(2)),
        aimY: Number(input.aimY.toFixed(2)),
        leftSign: input.left.sign,
        rightSign: input.right.sign,
        shieldActive: input.shieldActive,
        hp: Math.round(this.health),
        score: this.score,
        kills: this.kills,
      });
    }

    if (elapsed - this.lastHudEmit >= 0.05) {
      this.lastHudEmit = elapsed;
      this.emitHudSnapshot(false);
    }
  }

  private updateGauntlet(
    rig: HandGauntletRig,
    visualizer: GauntletVisualizerRig,
    hand: HandSnapshot,
    isLeft: boolean,
    shieldActive: boolean,
    fallbackX: number,
    fallbackY: number,
    chargeRatio: number,
    recoil: number,
    elapsed: number,
    dt: number,
  ): void {
    rig.root.visible = true;
    const spec = getGauntletSpec(this.equippedGauntlet);
    const signColor =
      this.equippedGauntlet === 'arcane'
        ? SIGN_COLORS[
            hand.detected ? hand.sign : isLeft ? (shieldActive ? 'open_palm' : 'none') : 'point'
          ]
        : isLeft
          ? spec.secondaryHex
          : spec.primaryHex;

    rig.accentMaterial.color.setHex(signColor);
    rig.accentMaterial.emissive.setHex(signColor);

    if (hand.detected && hand.landmarks.length >= 21) {
      for (let i = 0; i < 21; i++) {
        const lm = hand.landmarks[i];
        const wx = (lm.x - 0.5) * 4.2 + this.camera.position.x * 0.85;
        const wy = (0.55 - lm.y) * 2.8 + this.camera.position.y * 0.85;
        const wz = this.camera.position.z - 2.2 - lm.z * 2.2 + recoil * 0.25;
        rig.jointSpheres[i].visible = true;
        rig.jointSpheres[i].position.set(wx, wy, wz);
      }

      const bones = getHandBones();
      for (let i = 0; i < bones.length; i++) {
        const [a, b] = bones[i];
        _v1.copy(rig.jointSpheres[a].position);
        _v2.copy(rig.jointSpheres[b].position);
        const len = _v1.distanceTo(_v2);
        const seg = rig.boneSegments[i];
        seg.visible = true;
        seg.position.copy(_v1).add(_v2).multiplyScalar(0.5);
        seg.scale.set(1, Math.max(0.001, len), 1);
        _v3.copy(_v2).sub(_v1).normalize();
        _quat.setFromUnitVectors(_up, _v3);
        seg.quaternion.copy(_quat);
      }

      const palmPos = rig.jointSpheres[9].position;
      rig.palmRing.position.copy(palmPos);
      rig.palmRing.lookAt(this.camera.position);
      rig.palmRing.rotation.z = elapsed * 2.2;
      rig.palmCore.position.copy(palmPos);
      rig.palmCore.rotation.y = elapsed * 3.1;

      visualizer.update(
        dt,
        elapsed,
        palmPos,
        this.camera.position,
        hand.sign,
        chargeRatio,
        true,
      );
    } else {
      rig.jointSpheres.forEach((s) => (s.visible = false));
      rig.boneSegments.forEach((b) => (b.visible = false));

      const sideBias = isLeft ? -1.15 : 1.15;
      const px = this.camera.position.x + sideBias + fallbackX * 0.65;
      const py =
        this.camera.position.y -
        0.45 +
        fallbackY * 0.45 +
        Math.sin(elapsed * 2.5 + (isLeft ? 0 : 1.5)) * 0.05;
      const pz = this.camera.position.z - 2.05 + recoil * 0.25;

      rig.palmRing.position.set(px, py, pz);
      rig.palmRing.lookAt(this.camera.position);
      rig.palmRing.rotation.z = elapsed * 2.0;
      rig.palmCore.position.set(px, py, pz);
      rig.palmCore.rotation.y = elapsed * 3.0;

      visualizer.update(
        dt,
        elapsed,
        rig.palmCore.position,
        this.camera.position,
        isLeft ? (shieldActive ? 'open_palm' : 'none') : 'point',
        chargeRatio,
        true,
      );
    }

    if (rig.wardShieldGroup) {
      rig.wardShieldGroup.visible = shieldActive;
      if (shieldActive) {
        rig.wardShieldGroup.position.set(
          this.camera.position.x - 0.2 + (hand.detected ? (hand.palmX - 0.3) * 1.4 : 0),
          this.camera.position.y - 0.05,
          this.camera.position.z - 1.65,
        );
        rig.wardShieldGroup.rotation.z = elapsed * 0.9;
      }
    }
  }

  private tryCastSpell(spell: SpellType, aimWorldX: number, aimWorldY: number): void {
    const spec = getGauntletSpec(this.equippedGauntlet);
    const origin = _v1.copy(this.rightGauntlet.palmCore.position);
    const target = _v2.set(aimWorldX, aimWorldY, -6.5);
    const dir = _v3.copy(target).sub(origin).normalize();

    if (spell === 'cataclysm_convergence') {
      if (this.resonance < 100) return;
      this.resonance = 0;
      this.casts += 1;
      this.recoilRight = 1;
      this.recoilLeft = 1;
      this.lastCastLabel = spec.ultimateLabel;
      this.lastCastTimer = 2.0;
      this.audio.playSpell('cataclysm_convergence', this.equippedGauntlet);
      this.hitstopTimer = 0.06;
      this.cameraShake = 0.98;

      this.projectiles = this.projectiles.filter((p) => {
        if (!p.fromPlayer) {
          this.spawnBurst(p.pos, spec.primaryHex, 8);
          this.disposeProjectileMesh(p.mesh);
          return false;
        }
        return true;
      });

      this.spawnUltimateVisuals(origin.clone(), target.clone(), spec.primaryHex, spec.secondaryHex);

      this.enemies.slice().forEach((e) => {
        this.damageEnemy(e, Math.round(95 * spec.damageMult));
        this.spawnBurst(
          e.pos,
          this.equippedGauntlet === 'thanos' ? 0xfbbf24 : spec.secondaryHex,
          16,
        );
      });
      this.mpHooks?.onSendCastSpell(
        spell,
        [origin.x, origin.y, origin.z],
        [dir.x * 24, dir.y * 24, dir.z * 24],
      );
      return;
    }

    if (spell === 'sanctum_mend') {
      if (this.cooldowns.sanctum_mend > 0 || this.resonance < 40) return;
      this.cooldowns.sanctum_mend = 4.5;
      this.resonance -= 40;
      this.health = Math.min(this.maxHealth, this.health + 28);
      this.casts += 1;
      this.lastCastLabel = 'Sanctum Mend (+28)';
      this.lastCastTimer = 1.4;
      this.audio.playSpell('sanctum_mend', this.equippedGauntlet);
      this.spawnShockwave(origin.clone(), 0x4ade80, 3.2);
      return;
    }

    if (spell === 'astral_bolt') {
      if (this.cooldowns.astral_bolt > 0) return;
      this.cooldowns.astral_bolt = 0.18;
      this.casts += 1;
      this.recoilRight = 0.65;
      this.lastCastLabel = spec.boltLabel;
      this.lastCastTimer = 1.0;
      this.audio.playSpell('astral_bolt', this.equippedGauntlet);

      const speed = 28 * spec.speedMult;
      const dmg = Math.round(18 * spec.damageMult);

      if (this.equippedGauntlet === 'doctor_strange') {
        [-0.09, 0, 0.09].forEach((ang) => {
          const d = dir.clone().applyAxisAngle(_up, ang).multiplyScalar(speed);
          this.spawnProjectile(origin, d, true, null, null, Math.round(dmg * 0.72), 0, spec.primaryHex, this.boltGeo);
        });
      } else {
        const boltHex =
          this.equippedGauntlet === 'thanos'
            ? INFINITY_HUES[this.casts % INFINITY_HUES.length]
            : spec.primaryHex;
        const vel = dir.clone().multiplyScalar(speed);
        this.spawnProjectile(origin, vel, true, null, null, dmg, 0, boltHex, this.boltGeo);
        this.mpHooks?.onSendCastSpell(
          spell,
          [origin.x, origin.y, origin.z],
          [vel.x, vel.y, vel.z],
        );
      }
      return;
    }

    if (spell === 'twin_starfire') {
      if (this.cooldowns.twin_starfire > 0) return;
      this.cooldowns.twin_starfire = 0.55;
      this.casts += 1;
      this.recoilRight = 0.75;
      this.lastCastLabel =
        this.equippedGauntlet === 'iron_man' ? 'Micro-Missiles' : 'Twin Starfire';
      this.lastCastTimer = 1.2;
      this.audio.playSpell('twin_starfire', this.equippedGauntlet);

      const sorted = this.enemies
        .slice()
        .sort((a, b) => a.pos.distanceTo(origin) - b.pos.distanceTo(origin));
      const t1 = sorted[0]?.id ?? null;
      const t2 = sorted[1]?.id ?? t1;

      const speed = 20 * spec.speedMult;
      const dmg = Math.round(22 * spec.damageMult);
      const d1 = dir.clone().applyAxisAngle(_up, 0.14).multiplyScalar(speed);
      const d2 = dir.clone().applyAxisAngle(_up, -0.14).multiplyScalar(speed);
      this.spawnProjectile(origin, d1, true, null, t1, dmg, 0, spec.secondaryHex, this.starGeo);
      this.spawnProjectile(origin, d2, true, null, t2, dmg, 0, spec.primaryHex, this.starGeo);
      this.mpHooks?.onSendCastSpell(
        spell,
        [origin.x, origin.y, origin.z],
        [d1.x, d1.y, d1.z],
      );
      return;
    }

    if (spell === 'solar_shockwave') {
      if (this.cooldowns.solar_shockwave > 0) return;
      this.cooldowns.solar_shockwave = 1.8;
      this.casts += 1;
      this.recoilRight = 0.9;
      this.lastCastLabel = 'Solar Shockwave';
      this.lastCastTimer = 1.4;
      this.audio.playSpell('solar_shockwave', this.equippedGauntlet);
      this.cameraShake = Math.max(this.cameraShake, 0.42);
      this.spawnShockwave(
        new THREE.Vector3(this.playerOffsetX, 0.4, 2.2),
        spec.primaryHex,
        13 * spec.splashMult,
      );

      this.projectiles = this.projectiles.filter((p) => {
        if (!p.fromPlayer && p.pos.z > -10) {
          this.spawnBurst(p.pos, spec.primaryHex, 6);
          this.disposeProjectileMesh(p.mesh);
          return false;
        }
        return true;
      });
      this.enemies.slice().forEach((e) => {
        if (e.pos.distanceTo(this.camera.position) < 16 * spec.splashMult) {
          e.pos.z -= 3.2;
          this.damageEnemy(e, Math.round(26 * spec.damageMult));
        }
      });
      return;
    }

    if (spell === 'meteor_hammer') {
      if (this.cooldowns.meteor_hammer > 0) return;
      this.cooldowns.meteor_hammer = 2.2;
      this.casts += 1;
      this.recoilRight = 1.0;
      this.lastCastLabel =
        this.equippedGauntlet === 'thanos' ? 'Power Stone Meteor' : 'Meteor Hammer';
      this.lastCastTimer = 1.5;
      this.audio.playSpell('meteor_hammer', this.equippedGauntlet);
      this.cameraShake = Math.max(this.cameraShake, 0.38);

      const vel = dir.clone().multiplyScalar(21 * spec.speedMult);
      const dmg = Math.round(54 * spec.damageMult);
      const splash = 3.6 * spec.splashMult;
      const color =
        this.equippedGauntlet === 'doctor_doom'
          ? 0x10b981
          : this.equippedGauntlet === 'thanos'
            ? 0xa855f7
            : 0xf97316;
      this.spawnProjectile(origin, vel, true, null, null, dmg, splash, color, this.meteorGeo);
      this.mpHooks?.onSendCastSpell(
        spell,
        [origin.x, origin.y, origin.z],
        [vel.x, vel.y, vel.z],
      );
    }
  }

  private spawnUltimateVisuals(
    origin: THREE.Vector3,
    target: THREE.Vector3,
    primaryHex: number,
    secondaryHex: number,
  ): void {
    if (this.equippedGauntlet === 'iron_man') {
      const end = target.clone().add(new THREE.Vector3(0, 0, -14));
      this.spawnBeam(origin, end, 0x38bdf8, 1.35, 0.62);
      this.spawnBeam(origin, end, 0xffffff, 0.55, 0.52);
      this.spawnShockwave(new THREE.Vector3(0, 0.8, -6), 0x38bdf8, 18);
      this.spawnShockwave(origin, 0xef4444, 5.5);
    } else if (this.equippedGauntlet === 'doctor_strange') {
      for (let i = 0; i < 3; i++) {
        this.spawnShockwave(
          new THREE.Vector3(0, 0.6 + i * 0.7, -5 - i * 2),
          i % 2 === 0 ? 0xf59e0b : 0xfde047,
          16 + i * 3,
        );
      }
      this.spawnBeam(
        new THREE.Vector3(0, -1.5, -7),
        new THREE.Vector3(0, 8.5, -7),
        0xf59e0b,
        1.1,
        0.7,
      );
    } else if (this.equippedGauntlet === 'doctor_doom') {
      this.spawnShockwave(new THREE.Vector3(0, 0.4, -5), 0x10b981, 20);
      this.enemies.slice(0, 5).forEach((e) => {
        this.spawnBeam(
          new THREE.Vector3(e.pos.x, -1.5, e.pos.z),
          new THREE.Vector3(e.pos.x, 9.5, e.pos.z),
          0x10b981,
          0.95,
          0.65,
        );
      });
    } else if (this.equippedGauntlet === 'thanos') {
      INFINITY_HUES.forEach((hue, idx) => {
        this.spawnShockwave(
          new THREE.Vector3((idx - 2.5) * 1.4, 0.5 + (idx % 2) * 0.8, -6),
          hue,
          18 + idx * 1.4,
        );
      });
      this.spawnBeam(
        new THREE.Vector3(0, -1.5, -6.5),
        new THREE.Vector3(0, 12, -6.5),
        0xfacc15,
        1.6,
        0.75,
      );
    } else {
      this.spawnShockwave(new THREE.Vector3(0, 0.5, -4), primaryHex, 20);
      this.spawnShockwave(new THREE.Vector3(0, 1.0, -7), secondaryHex, 15);
    }
  }

  private spawnBeam(
    start: THREE.Vector3,
    end: THREE.Vector3,
    colorHex: number,
    radius: number,
    duration: number,
  ): void {
    const dir = _v1.copy(end).sub(start);
    const len = Math.max(0.5, dir.length());
    dir.normalize();
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.beamGeo, mat);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(_up, dir);
    mesh.scale.set(radius, len, radius);
    this.scene.add(mesh);
    this.beams.push({ mesh, life: duration, maxLife: duration, baseScaleXZ: radius });
  }

  private disposeProjectileMesh(mesh: THREE.Mesh): void {
    this.scene.remove(mesh);
    (mesh.material as THREE.Material).dispose();
    mesh.children.forEach((child) => {
      if (child instanceof THREE.Sprite) {
        child.material.dispose();
      }
    });
  }

  private spawnProjectile(
    origin: THREE.Vector3,
    vel: THREE.Vector3,
    fromPlayer: boolean,
    remoteOwnerId: string | null,
    homingTargetId: number | null,
    damage: number,
    splashRadius: number,
    colorHex: number,
    geo: THREE.BufferGeometry,
  ): void {
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 1.85,
      roughness: 0.15,
      metalness: 0.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);

    const flareMat = new THREE.SpriteMaterial({
      map: this.projectileFlareTex,
      color: colorHex,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flare = new THREE.Sprite(flareMat);
    const flareSize = splashRadius > 0 ? 1.55 : 0.92;
    flare.scale.set(flareSize, flareSize, 1);
    mesh.add(flare);

    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      pos: mesh.position,
      vel,
      fromPlayer,
      remoteOwnerId,
      homingTargetId,
      damage,
      splashRadius,
      life: 3.5,
      colorHex,
    });
  }

  private updateCrystals(
    elapsed: number,
    dt: number,
    telekinesisActive: boolean,
    aimX: number,
    aimY: number,
  ): void {
    for (let i = this.crystals.length - 1; i >= 0; i--) {
      const c = this.crystals[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.scene.remove(c.rig.root);
        c.rig.dispose();
        this.crystals.splice(i, 1);
        continue;
      }
      c.rig.core.rotation.y = elapsed * 2.2;
      c.rig.ring.rotation.x = elapsed * 1.8;
      c.rig.ring.rotation.z = elapsed * 1.1;
      c.pos.y += Math.sin(elapsed * 2.6 + c.id) * 0.25 * dt;

      if (telekinesisActive) {
        const d = Math.hypot(c.pos.x - aimX, c.pos.y - aimY);
        if (d < 3.6) {
          c.pos.x += (aimX - c.pos.x) * Math.min(1, dt * 6);
          c.pos.y += (aimY - c.pos.y) * Math.min(1, dt * 6);
          if (d < 0.75) {
            this.activateCrystal(c, i);
          }
        }
      }
    }
  }

  private activateCrystal(c: ActiveCrystal, idx: number): void {
    const color =
      c.kind === 'overcharge'
        ? 0x22d3ee
        : c.kind === 'chrono'
          ? 0xfbbf24
          : 0x34d399;
    this.spawnShockwave(c.pos.clone(), color, 5.5);
    this.spawnBurst(c.pos, color, 18);

    if (c.kind === 'overcharge') {
      this.cooldowns = {
        astral_bolt: 0,
        twin_starfire: 0,
        solar_shockwave: 0,
        meteor_hammer: 0,
        sanctum_mend: 0,
      };
      this.resonance = Math.min(100, this.resonance + 25);
      this.awardScore(150);
      this.lastCastLabel = 'Overcharge Crystal!';
    } else if (c.kind === 'chrono') {
      this.chronoSlowTimer = 4.5;
      this.awardScore(150);
      this.lastCastLabel = 'Chrono Anchor (Slow-Mo)!';
      if (this.matchMode === 'coop') {
        this.mpHooks?.onSendCoopEvent('chrono_slow', {});
      }
    } else {
      this.health = Math.min(this.maxHealth, this.health + 22);
      this.awardScore(150);
      this.lastCastLabel = 'Vitality Conduit (+22)';
      if (this.matchMode === 'coop') {
        this.mpHooks?.onSendCoopEvent('vitality_heal', { amount: 18 });
      }
    }
    this.lastCastTimer = 1.6;
    this.audio.playWaveClear();

    this.scene.remove(c.rig.root);
    c.rig.dispose();
    this.crystals.splice(idx, 1);
  }

  private updateEnemies(
    elapsed: number,
    dt: number,
    telekinesisActive: boolean,
    aimX: number,
    aimY: number,
  ): void {
    let lockedEnemy: ActiveEnemy | null = null;
    if (telekinesisActive && this.enemies.length > 0) {
      let bestDist = Infinity;
      for (const e of this.enemies) {
        const d = Math.hypot(e.pos.x - aimX, e.pos.y - aimY);
        if (d < bestDist) {
          bestDist = d;
          lockedEnemy = e;
        }
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];

      if (e.spawnAnimTimer > 0) {
        e.spawnAnimTimer = Math.max(0, e.spawnAnimTimer - dt);
        const s = 1 - e.spawnAnimTimer / 0.45;
        e.rig.root.scale.setScalar(0.1 + s * 0.9);
      }

      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer -= dt;
        if (e.hitFlashTimer <= 0) {
          e.rig.bodyMat.emissive.setHex(0x000000);
          e.rig.bodyMat.emissiveIntensity = 0;
        }
      }

      e.rig.orbiters.forEach((orb, idx) => {
        orb.rotation.y += dt * (1.8 + idx * 0.6);
        orb.rotation.x += dt * 0.7;
      });

      if (lockedEnemy === e) {
        e.pos.x += (aimX - e.pos.x) * Math.min(1, dt * 4.5);
        e.pos.y += (aimY - e.pos.y) * Math.min(1, dt * 4.5);
        e.rig.visorMat.emissive.setHex(0xc084fc);
      } else {
        const speed = e.kind === 'wisp' ? 2.4 : e.kind === 'sentinel' ? 1.15 : 0.75;
        const desiredZ = e.kind === 'wisp' ? -5.5 : e.kind === 'sentinel' ? -7.5 : -9.5;
        if (e.pos.z < desiredZ) {
          e.pos.z += speed * dt;
        }
        e.pos.x += Math.sin(elapsed * 1.4 + e.phaseOffset) * e.strafeDir * speed * 0.75 * dt;
        e.pos.x = THREE.MathUtils.clamp(e.pos.x, -7.5, 7.5);
        e.pos.y += Math.cos(elapsed * 2.1 + e.phaseOffset) * 0.35 * dt;
      }

      e.rig.root.lookAt(this.camera.position.x, e.pos.y, this.camera.position.z);

      if (e.windupTimer > 0) {
        e.windupTimer -= dt;
        const pulse = 1 + Math.sin(elapsed * 32) * 0.16;
        e.rig.coreMat.emissiveIntensity = 3.2;
        e.rig.visorMat.emissiveIntensity = 3.5;
        e.rig.root.scale.setScalar(pulse);
        if (e.windupTimer <= 0) {
          e.rig.root.scale.setScalar(1);
          e.rig.coreMat.emissiveIntensity = 1.5;
          e.rig.visorMat.emissiveIntensity = 1.9;
          this.fireEnemyAttack(e);
        }
      } else {
        e.attackCooldown -= dt;
        if (e.attackCooldown <= 0) {
          e.windupTimer = e.kind === 'wisp' ? 0.55 : e.kind === 'sentinel' ? 0.9 : 1.05;
          e.attackCooldown =
            e.kind === 'wisp' ? 2.5 : e.kind === 'sentinel' ? 3.2 : 2.6;
        }
      }
    }
  }

  private fireEnemyAttack(e: ActiveEnemy): void {
    const toPlayer = _v1
      .set(this.playerOffsetX, 1.05 + this.playerOffsetY, 4.6)
      .sub(e.pos)
      .normalize();

    if (e.kind === 'spire') {
      [-0.22, 0, 0.22].forEach((angle) => {
        const dir = toPlayer.clone().applyAxisAngle(_up, angle).multiplyScalar(10.5);
        this.spawnProjectile(e.pos, dir, false, null, null, 14, 0, 0xf43f5e, this.enemyOrbGeo);
      });
    } else if (e.kind === 'sentinel') {
      const dir = toPlayer.clone().multiplyScalar(11.5);
      this.spawnProjectile(e.pos, dir, false, null, null, 16, 0, 0xf59e0b, this.enemyOrbGeo);
    } else {
      const dir = toPlayer.clone().multiplyScalar(12.5);
      this.spawnProjectile(e.pos, dir, false, null, null, 10, 0, 0xa855f7, this.enemyOrbGeo);
    }
  }

  private updateProjectiles(dt: number, enemyDt: number, shieldActive: boolean): void {
    const spec = getGauntletSpec(this.equippedGauntlet);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.disposeProjectileMesh(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.fromPlayer && p.homingTargetId !== null) {
        const target = this.enemies.find((e) => e.id === p.homingTargetId);
        if (target) {
          const speed = p.vel.length();
          _v1.copy(target.pos).sub(p.pos).normalize().multiplyScalar(speed);
          p.vel.lerp(_v1, Math.min(1, dt * 6.5));
        }
      }

      const stepDt = p.fromPlayer ? dt : enemyDt;
      p.pos.addScaledVector(p.vel, stepDt);
      p.mesh.rotation.x += dt * 7;
      p.mesh.rotation.y += dt * 9;

      if (p.fromPlayer) {
        let hit = false;

        // Check Interactive Crystal hit
        for (let cIdx = this.crystals.length - 1; cIdx >= 0; cIdx--) {
          const c = this.crystals[cIdx];
          if (p.pos.distanceTo(c.pos) <= 0.78) {
            this.activateCrystal(c, cIdx);
            hit = true;
            break;
          }
        }

        // Check PvP opponent avatar hit
        if (!hit && this.matchMode === 'pvp' && p.remoteOwnerId === null) {
          for (const [id, entry] of this.remoteAvatars.entries()) {
            _v1.copy(entry.rig.root.position);
            _v1.y += 0.9;
            if (p.pos.distanceTo(_v1) <= 0.95) {
              hit = true;
              this.spawnBurst(p.pos, spec.primaryHex, 14);
              this.mpHooks?.onSendPvpDamage(id, p.damage);
              this.awardScore(60);
              break;
            }
          }
        }

        // Check enemy hit
        if (!hit) {
          for (let j = this.enemies.length - 1; j >= 0; j--) {
            const e = this.enemies[j];
            if (p.pos.distanceTo(e.pos) <= e.radius + 0.35) {
              hit = true;
              if (p.splashRadius > 0) {
                this.hitstopTimer = 0.045;
                this.cameraShake = Math.max(this.cameraShake, 0.55);
                this.spawnShockwave(p.pos.clone(), p.colorHex, p.splashRadius);
                this.enemies.slice().forEach((other) => {
                  if (other.pos.distanceTo(p.pos) <= p.splashRadius) {
                    this.damageEnemy(other, p.damage);
                  }
                });
              } else {
                this.damageEnemy(e, p.damage);
              }
              this.spawnBurst(p.pos, p.colorHex, 12);
              break;
            }
          }
        }

        if (hit) {
          this.disposeProjectileMesh(p.mesh);
          this.projectiles.splice(i, 1);
        }
      } else {
        if (shieldActive && p.pos.z >= 2.8 && p.pos.z <= 4.1) {
          const dx = Math.abs(p.pos.x - this.camera.position.x);
          const dy = Math.abs(p.pos.y - this.camera.position.y);
          const shieldRange = this.equippedGauntlet === 'doctor_strange' ? 1.6 : 1.35;
          if (dx < shieldRange && dy < shieldRange) {
            p.fromPlayer = true;
            p.damage = this.equippedGauntlet === 'doctor_doom' ? 58 : 42;
            p.vel.negate().multiplyScalar(this.equippedGauntlet === 'doctor_doom' ? 2.3 : 1.85);
            p.colorHex = spec.secondaryHex;
            (p.mesh.material as THREE.MeshStandardMaterial).color.setHex(spec.secondaryHex);
            (p.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(spec.secondaryHex);
            p.mesh.children.forEach((child) => {
              if (child instanceof THREE.Sprite) {
                child.material.color.setHex(spec.secondaryHex);
              }
            });
            this.parries += 1;
            this.recoilLeft = 0.7;
            this.resonance = Math.min(100, this.resonance + spec.parryBonus);
            this.awardScore(85);
            this.lastCastLabel =
              this.equippedGauntlet === 'doctor_strange'
                ? 'Seraphim Parry!'
                : 'Aegis Parry!';
            this.lastCastTimer = 1.1;
            this.audio.playParry();
            this.spawnBurst(p.pos, spec.secondaryHex, 12);
            if (this.equippedGauntlet === 'doctor_doom') {
              this.spawnShockwave(p.pos.clone(), 0x10b981, 5.2);
            }
            continue;
          }
        }

        if (p.pos.z >= 4.4) {
          const hitDist = Math.hypot(
            p.pos.x - this.camera.position.x,
            p.pos.y - this.camera.position.y,
          );
          if (hitDist < 1.25) {
            this.health = Math.max(0, this.health - p.damage);
            this.combo = 0;
            this.cameraShake = Math.max(this.cameraShake, 0.65);
            this.audio.playPlayerDamage();
            this.spawnBurst(p.pos, 0xf43f5e, 14);
            if (this.health <= 0) {
              this.triggerGameOver();
            }
          }
          this.disposeProjectileMesh(p.mesh);
          this.projectiles.splice(i, 1);
        }
      }
    }
  }

  private updateRemoteAvatars(elapsed: number, dt: number): void {
    const damp = 1 - Math.exp(-10 * dt);
    for (const entry of this.remoteAvatars.values()) {
      entry.rig.root.position.lerp(entry.targetPos, damp);
      entry.rig.helm.rotation.y = elapsed * 1.4;
      entry.rig.gauntletOrb.position.y = 0.85 + Math.sin(elapsed * 3) * 0.06;
    }
  }

  private awardScore(points: number): void {
    this.score += points;
    this.bankPoints += points;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
    }
    this.savePersistence();
  }

  private damageEnemy(enemy: ActiveEnemy, amount: number): void {
    enemy.hp -= amount;
    enemy.hitFlashTimer = 0.09;
    enemy.rig.bodyMat.emissive.setHex(0xffffff);
    enemy.rig.bodyMat.emissiveIntensity = 1.6;

    if (enemy.hp <= 0) {
      this.audio.playImpact(enemy.kind !== 'wisp');
      const deathColor =
        this.equippedGauntlet === 'thanos'
          ? 0xfbbf24
          : enemy.kind === 'wisp'
            ? 0xa855f7
            : enemy.kind === 'sentinel'
              ? 0xf59e0b
              : 0xf43f5e;
      this.spawnBurst(enemy.pos, deathColor, 22);
      this.scene.remove(enemy.rig.root);
      const idx = this.enemies.indexOf(enemy);
      if (idx !== -1) this.enemies.splice(idx, 1);

      this.kills += 1;
      this.combo += 1;
      this.comboTimer = 4.2;
      const mult = 1 + Math.min(3, Math.floor(this.combo / 3) * 0.5);
      this.awardScore(Math.round(enemy.scoreValue * mult));
      this.resonance = Math.min(100, this.resonance + (enemy.kind === 'spire' ? 28 : 10));
    } else {
      this.audio.playImpact(false);
    }
  }

  private triggerGameOver(): void {
    this.phase = 'gameover';
    this.emitHudSnapshot(true);
  }

  private spawnShockwave(pos: THREE.Vector3, colorHex: number, maxScale: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.copy(pos);
    mesh.rotation.x = Math.PI / 2;
    mesh.scale.setScalar(0.2);
    this.scene.add(mesh);
    this.shockwaves.push({ mesh, life: 0.45, maxLife: 0.45, maxScale });
  }

  private spawnBurst(pos: THREE.Vector3, colorHex: number, count: number): void {
    let spawned = 0;
    for (let i = 0; i < this.sparkPool.length && spawned < count; i++) {
      const sp = this.sparkPool[i];
      if (!sp.active) {
        sp.active = true;
        sp.pos.copy(pos);
        sp.vel.set(
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.3) * 9,
          (Math.random() - 0.5) * 9,
        );
        sp.maxLife = 0.35 + Math.random() * 0.35;
        sp.life = sp.maxLife;
        sp.scale = 0.7 + Math.random() * 0.8;
        sp.color.setHex(colorHex);
        spawned++;
      }
    }
  }

  private updateEffects(dt: number): void {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
        this.shockwaves.splice(i, 1);
        continue;
      }
      const progress = 1 - s.life / s.maxLife;
      const scale = 0.3 + progress * s.maxScale;
      s.mesh.scale.setScalar(scale);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.85;
    }

    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        (b.mesh.material as THREE.Material).dispose();
        this.beams.splice(i, 1);
        continue;
      }
      const t = b.life / b.maxLife;
      const xz = b.baseScaleXZ * (0.4 + 0.6 * t);
      b.mesh.scale.x = xz;
      b.mesh.scale.z = xz;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = t * 0.9;
    }

    let sparksDirty = false;
    for (let i = 0; i < this.sparkPool.length; i++) {
      const sp = this.sparkPool[i];
      if (!sp.active) continue;
      sparksDirty = true;
      sp.life -= dt;
      if (sp.life <= 0) {
        sp.active = false;
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.sparkInstanced.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      sp.vel.y -= 9.5 * dt;
      sp.pos.addScaledVector(sp.vel, dt);
      const t = sp.life / sp.maxLife;
      _dummy.position.copy(sp.pos);
      _dummy.rotation.set(t * 6, t * 4, 0);
      _dummy.scale.setScalar(sp.scale * t);
      _dummy.updateMatrix();
      this.sparkInstanced.setMatrixAt(i, _dummy.matrix);
      this.sparkInstanced.setColorAt(i, sp.color);
    }

    if (sparksDirty) {
      this.sparkInstanced.instanceMatrix.needsUpdate = true;
      if (this.sparkInstanced.instanceColor) {
        this.sparkInstanced.instanceColor.needsUpdate = true;
      }
    }
  }

  public emitHudSnapshot(force = false): void {
    if (this.disposed) return;
    if (!force && this.phase === 'title') return;
    const input = this.inputRef.current;

    this.onHudUpdate({
      phase: this.phase,
      viewMode: this.viewMode,
      inputMode: this.inputMode,
      matchMode: this.matchMode,
      cameraStatus: this.cameraStatus,
      cameraError: this.cameraError,
      health: Math.round(this.health),
      maxHealth: this.maxHealth,
      resonance: Math.round(this.resonance),
      wave: this.wave,
      enemiesRemaining: this.enemies.length + this.waveSpawnQueue.length,
      score: this.score,
      bankPoints: this.bankPoints,
      equippedGauntlet: this.equippedGauntlet,
      unlockedGauntlets: [...this.unlockedGauntlets],
      combo: this.combo,
      kills: this.kills,
      parries: this.parries,
      casts: this.casts,
      bestScore: this.bestScore,
      leftDetected: input.left.detected,
      rightDetected: input.right.detected,
      leftSign: input.left.sign,
      rightSign: input.right.sign,
      lastCastLabel: this.lastCastLabel,
      waveBanner: this.waveBanner,
      cooldowns: { ...this.cooldowns },
      meteorCharge: input.meteorChargeRatio,
      shieldActive: input.shieldActive,
      chronoSlowTimer: this.chronoSlowTimer,
      isMuted: this.audio.isMuted(),
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.clearCombatEntities();
    for (const entry of this.remoteAvatars.values()) {
      this.scene.remove(entry.rig.root);
      entry.rig.dispose();
    }
    this.remoteAvatars.clear();

    this.leftVisualizer.dispose();
    this.rightVisualizer.dispose();
    this.sanctum.dispose();
    this.textures.dispose();
    this.projectileFlareTex.dispose();
    this.boltGeo.dispose();
    this.starGeo.dispose();
    this.meteorGeo.dispose();
    this.enemyOrbGeo.dispose();
    this.ringGeo.dispose();
    this.beamGeo.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
