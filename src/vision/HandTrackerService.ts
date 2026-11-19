import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import {
  CameraStatus,
  HandSign,
  HandSnapshot,
  LandmarkPoint,
  PlayerInputState,
} from '../types/game';
import {
  classifyHandSign,
  SIGN_LABELS,
  SignStabilizer,
} from './gestureClassifier';

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const MODEL_LOCAL_URL = '/models/hand_landmarker.task';
const MODEL_CDN_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

function createEmptyHand(): HandSnapshot {
  return {
    detected: false,
    palmX: 0.5,
    palmY: 0.5,
    palmZ: 0,
    sign: 'none',
    confidence: 0,
    landmarks: [],
  };
}

export interface TrackerCallbacks {
  onStatusChange: (status: CameraStatus, error: string | null) => void;
}

export class HandTrackerService {
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private debugCanvasEl: HTMLCanvasElement | null = null;
  private rafId = 0;
  private lastVideoTime = -1;
  private running = false;
  private initializing = false;

  private readonly leftStabilizer = new SignStabilizer(3);
  private readonly rightStabilizer = new SignStabilizer(3);
  private prevRightSign: HandSign = 'none';
  private prevLeftSign: HandSign = 'none';
  private rightHoldTime = 0;
  private lastDetectTs = 0;

  private readonly callbacks: TrackerCallbacks;

  constructor(callbacks: TrackerCallbacks) {
    this.callbacks = callbacks;
  }

  public attachElements(
    video: HTMLVideoElement | null,
    debugCanvas: HTMLCanvasElement | null,
  ): void {
    this.videoEl = video;
    this.debugCanvasEl = debugCanvas;
    if (video && this.stream && video.srcObject !== this.stream) {
      video.srcObject = this.stream;
      void video.play().catch(() => {});
    }
  }

  public setDebugCanvas(canvas: HTMLCanvasElement | null): void {
    this.debugCanvasEl = canvas;
  }

  public async start(inputRef: { current: PlayerInputState }): Promise<boolean> {
    if (this.running) return true;
    if (this.initializing) return false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.callbacks.onStatusChange(
        'unavailable',
        'Webcam API is unavailable in this browser context.',
      );
      return false;
    }

    this.initializing = true;
    this.callbacks.onStatusChange('loading', null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      this.stream = stream;
      if (this.videoEl) {
        this.videoEl.srcObject = stream;
        await this.videoEl.play();
      }

      if (!this.landmarker) {
        this.landmarker = await this.createLandmarker();
      }

      this.running = true;
      this.initializing = false;
      this.lastVideoTime = -1;
      this.lastDetectTs = performance.now();
      this.callbacks.onStatusChange('active', null);
      this.loop(inputRef);
      return true;
    } catch (err) {
      this.initializing = false;
      this.stopStream();
      const message = err instanceof Error ? err.message : String(err);
      const isDenied = /Permission|NotAllowed|denied/i.test(message);
      const isNotFound = /NotFound|DevicesNotFound|Requested device not found/i.test(
        message,
      );
      if (isDenied) {
        this.callbacks.onStatusChange(
          'denied',
          'Camera permission was denied. You can play immediately using Mouse & Keys.',
        );
      } else if (isNotFound) {
        this.callbacks.onStatusChange(
          'unavailable',
          'No camera detected. Switched to Mouse & Keys fallback.',
        );
      } else {
        this.callbacks.onStatusChange(
          'error',
          `Hand tracking initialization failed: ${message}`,
        );
      }
      return false;
    }
  }

  private async createLandmarker(): Promise<HandLandmarker> {
    let vision;
    try {
      vision = await FilesetResolver.forVisionTasks('/wasm');
    } catch {
      vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm',
      );
    }

    const modelExistsLocally = await fetch(MODEL_LOCAL_URL, { method: 'HEAD' })
      .then((res) => res.ok)
      .catch(() => false);
    const modelPath = modelExistsLocally ? MODEL_LOCAL_URL : MODEL_CDN_URL;

    try {
      return await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.5,
      });
    } catch {
      return await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.5,
      });
    }
  }

  private loop(inputRef: { current: PlayerInputState }): void {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(() => this.loop(inputRef));

    const video = this.videoEl;
    if (!video || !this.landmarker || video.readyState < 2) return;

    const now = performance.now();
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    const dt = Math.min((now - this.lastDetectTs) / 1000, 0.1);
    this.lastDetectTs = now;

    const result = this.landmarker.detectForVideo(video, now);
    this.processResult(result, inputRef.current, dt);
    this.drawDebugOverlay(inputRef.current);
  }

  private processResult(
    result: ReturnType<HandLandmarker['detectForVideo']>,
    input: PlayerInputState,
    dt: number,
  ): void {
    const detectedHands: Array<{
      mirroredLandmarks: LandmarkPoint[];
      palmX: number;
      palmY: number;
      palmZ: number;
      rawSign: HandSign;
      confidence: number;
      mpCategory: string;
    }> = [];

    if (result.landmarks && result.landmarks.length > 0) {
      for (let i = 0; i < result.landmarks.length; i++) {
        const rawLms = result.landmarks[i];
        const mpHandedness = result.handednesses?.[i]?.[0];
        const mpCategory = mpHandedness?.categoryName ?? 'Right';
        const confidence = mpHandedness?.score ?? 0.85;

        const mirroredLandmarks: LandmarkPoint[] = rawLms.map((lm) => ({
          x: 1 - lm.x,
          y: lm.y,
          z: lm.z,
        }));

        const palmX =
          (mirroredLandmarks[0].x +
            mirroredLandmarks[5].x +
            mirroredLandmarks[9].x +
            mirroredLandmarks[17].x) /
          4;
        const palmY =
          (mirroredLandmarks[0].y +
            mirroredLandmarks[5].y +
            mirroredLandmarks[9].y +
            mirroredLandmarks[17].y) /
          4;
        const palmZ = mirroredLandmarks[9].z;

        const rawSign = classifyHandSign(mirroredLandmarks);
        detectedHands.push({
          mirroredLandmarks,
          palmX,
          palmY,
          palmZ,
          rawSign,
          confidence,
          mpCategory,
        });
      }
    }

    let leftCandidate: (typeof detectedHands)[number] | null = null;
    let rightCandidate: (typeof detectedHands)[number] | null = null;

    if (detectedHands.length >= 2) {
      detectedHands.sort((a, b) => a.palmX - b.palmX);
      leftCandidate = detectedHands[0];
      rightCandidate = detectedHands[1];
    } else if (detectedHands.length === 1) {
      const only = detectedHands[0];
      // In mirrored selfie space, physical right hand sits on the right side or reports "Left" in unmirrored MediaPipe
      const isRightSide = only.palmX >= 0.48 || only.mpCategory === 'Left';
      if (isRightSide) {
        rightCandidate = only;
      } else {
        leftCandidate = only;
      }
    }

    if (leftCandidate) {
      const stableLeft = this.leftStabilizer.update(leftCandidate.rawSign);
      this.smoothHandInto(input.left, leftCandidate, stableLeft, dt);
    } else {
      this.leftStabilizer.reset();
      input.left = createEmptyHand();
    }

    if (rightCandidate) {
      const stableRight = this.rightStabilizer.update(rightCandidate.rawSign);
      this.smoothHandInto(input.right, rightCandidate, stableRight, dt);
    } else {
      this.rightStabilizer.reset();
      input.right = createEmptyHand();
    }

    this.mapHandsToGameActions(input, dt);
  }

  private smoothHandInto(
    target: HandSnapshot,
    source: {
      mirroredLandmarks: LandmarkPoint[];
      palmX: number;
      palmY: number;
      palmZ: number;
      confidence: number;
    },
    sign: HandSign,
    dt: number,
  ): void {
    const alpha = 1 - Math.exp(-18 * dt);
    if (!target.detected) {
      target.palmX = source.palmX;
      target.palmY = source.palmY;
      target.palmZ = source.palmZ;
      target.landmarks = source.mirroredLandmarks;
    } else {
      target.palmX += (source.palmX - target.palmX) * alpha;
      target.palmY += (source.palmY - target.palmY) * alpha;
      target.palmZ += (source.palmZ - target.palmZ) * alpha;
      target.landmarks = source.mirroredLandmarks.map((lm, idx) => {
        const prev = target.landmarks[idx] ?? lm;
        return {
          x: prev.x + (lm.x - prev.x) * alpha,
          y: prev.y + (lm.y - prev.y) * alpha,
          z: prev.z + (lm.z - prev.z) * alpha,
        };
      });
    }
    target.detected = true;
    target.sign = sign;
    target.confidence = source.confidence;
  }

  private mapHandsToGameActions(input: PlayerInputState, dt: number): void {
    // Left hand steers strafe/dodge and shield/telekinesis
    if (input.left.detected) {
      const targetStrafeX = Math.max(-1, Math.min(1, (input.left.palmX - 0.28) * 3.2));
      const targetStrafeY = Math.max(-1, Math.min(1, (0.55 - input.left.palmY) * 2.6));
      const damp = 1 - Math.exp(-10 * dt);
      input.strafeX += (targetStrafeX - input.strafeX) * damp;
      input.strafeY += (targetStrafeY - input.strafeY) * damp;

      input.shieldActive = input.left.sign === 'open_palm';
      input.telekinesisActive = input.left.sign === 'pinch';
      input.manaSurgeActive = input.left.sign === 'fist';
    } else {
      input.shieldActive = false;
      input.telekinesisActive = false;
      input.manaSurgeActive = false;
    }

    // Right hand aims & casts spells
    if (input.right.detected) {
      // Aim cursor tracks index tip (#8) when pointing/peace, else palm center
      const aimSource =
        input.right.sign === 'point' || input.right.sign === 'peace'
          ? input.right.landmarks[8] ?? { x: input.right.palmX, y: input.right.palmY }
          : { x: input.right.palmX, y: input.right.palmY };

      const targetAimX = Math.max(-1, Math.min(1, (aimSource.x - 0.62) * 2.6));
      const targetAimY = Math.max(-1, Math.min(1, (0.52 - aimSource.y) * 2.4));
      const damp = 1 - Math.exp(-14 * dt);
      input.aimX += (targetAimX - input.aimX) * damp;
      input.aimY += (targetAimY - input.aimY) * damp;

      const sign = input.right.sign;

      // Dual-hand cataclysm convergence check
      if (
        input.left.detected &&
        ((input.left.sign === 'open_palm' && sign === 'open_palm') ||
          (input.left.sign === 'pinch' && sign === 'pinch'))
      ) {
        if (this.prevLeftSign !== input.left.sign || this.prevRightSign !== sign) {
          input.queuedSpell = 'cataclysm_convergence';
        }
      }

      // Meteor charge with closed fist -> release on opening or point
      if (sign === 'fist') {
        input.meteorCharging = true;
        input.meteorChargeRatio = Math.min(1, input.meteorChargeRatio + dt * 1.15);
      } else {
        if (this.prevRightSign === 'fist' && input.meteorChargeRatio >= 0.45) {
          input.queuedSpell = 'meteor_hammer';
        }
        input.meteorCharging = false;
        input.meteorChargeRatio = 0;
      }

      // Continuous/edge spell casting
      if (sign === 'point') {
        this.rightHoldTime += dt;
        if (this.prevRightSign !== 'point' || this.rightHoldTime >= 0.24) {
          input.queuedSpell = input.queuedSpell ?? 'astral_bolt';
          this.rightHoldTime = 0;
        }
      } else if (sign === 'peace') {
        this.rightHoldTime += dt;
        if (this.prevRightSign !== 'peace' || this.rightHoldTime >= 0.55) {
          input.queuedSpell = input.queuedSpell ?? 'twin_starfire';
          this.rightHoldTime = 0;
        }
      } else if (sign === 'open_palm' && this.prevRightSign !== 'open_palm') {
        input.queuedSpell = input.queuedSpell ?? 'solar_shockwave';
        this.rightHoldTime = 0;
      } else if (sign === 'thumbs_up' && this.prevRightSign !== 'thumbs_up') {
        input.queuedSpell = input.queuedSpell ?? 'sanctum_mend';
        this.rightHoldTime = 0;
      } else {
        this.rightHoldTime = 0;
      }

      this.prevRightSign = sign;
    } else {
      input.meteorCharging = false;
      input.meteorChargeRatio = 0;
      this.prevRightSign = 'none';
      this.rightHoldTime = 0;
    }

    this.prevLeftSign = input.left.sign;
  }

  private drawDebugOverlay(input: PlayerInputState): void {
    const canvas = this.debugCanvasEl;
    const video = this.videoEl;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw subtle mirrored thumbnail of webcam feed inside PiP canvas
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.globalAlpha = 0.45;
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();

    const drawHand = (hand: HandSnapshot, accent: string, tag: string) => {
      if (!hand.detected || hand.landmarks.length < 21) return;

      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        const p1 = hand.landmarks[a];
        const p2 = hand.landmarks[b];
        ctx.moveTo(p1.x * w, p1.y * h);
        ctx.lineTo(p2.x * w, p2.y * h);
      }
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      for (let i = 0; i < hand.landmarks.length; i++) {
        const lm = hand.landmarks[i];
        const radius = i === 4 || i === 8 || i === 12 || i === 16 || i === 20 ? 3.5 : 2;
        ctx.beginPath();
        ctx.arc(lm.x * w, lm.y * h, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      const labelX = Math.max(8, Math.min(w - 110, hand.palmX * w - 40));
      const labelY = Math.max(16, hand.palmY * h - 22);
      ctx.fillStyle = 'rgba(9, 13, 26, 0.85)';
      ctx.fillRect(labelX - 4, labelY - 12, 108, 16);
      ctx.fillStyle = accent;
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillText(`${tag}: ${SIGN_LABELS[hand.sign]}`, labelX, labelY);
    };

    drawHand(input.left, '#34d399', 'L');
    drawHand(input.right, '#22d3ee', 'R');
  }

  public stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.stopStream();
    this.leftStabilizer.reset();
    this.rightStabilizer.reset();
  }

  private stopStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
    }
  }

  public dispose(): void {
    this.stop();
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
  }
}
