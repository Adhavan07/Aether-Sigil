import { HandSign, LandmarkPoint } from '../types/game';

function dist2D(a: LandmarkPoint, b: LandmarkPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Classifies 21 MediaPipe hand landmarks into crisp, posture-invariant signs
 * normalized by palm size (wrist #0 to middle MCP #9).
 */
export function classifyHandSign(landmarks: LandmarkPoint[]): HandSign {
  if (landmarks.length < 21) return 'none';

  const wrist = landmarks[0];
  const thumbCmc = landmarks[1];
  const thumbMcp = landmarks[2];
  const thumbIp = landmarks[3];
  const thumbTip = landmarks[4];

  const indexMcp = landmarks[5];
  const indexPip = landmarks[6];
  const indexTip = landmarks[8];

  const middleMcp = landmarks[9];
  const middlePip = landmarks[10];
  const middleTip = landmarks[12];

  const ringMcp = landmarks[13];
  const ringPip = landmarks[14];
  const ringTip = landmarks[16];

  const pinkyMcp = landmarks[17];
  const pinkyPip = landmarks[18];
  const pinkyTip = landmarks[20];

  const palmScale = Math.max(0.03, dist2D(wrist, middleMcp));

  const isExtended = (tip: LandmarkPoint, pip: LandmarkPoint, mcp: LandmarkPoint) => {
    const tipDist = dist2D(wrist, tip);
    const pipDist = dist2D(wrist, pip);
    const mcpDist = dist2D(wrist, mcp);
    return tipDist > pipDist * 1.07 && tipDist > mcpDist * 1.25;
  };

  const indexUp = isExtended(indexTip, indexPip, indexMcp);
  const middleUp = isExtended(middleTip, middlePip, middleMcp);
  const ringUp = isExtended(ringTip, ringPip, ringMcp);
  const pinkyUp = isExtended(pinkyTip, pinkyPip, pinkyMcp);

  // Thumb extension measured away from index MCP & pinky MCP
  const thumbOut =
    dist2D(thumbTip, pinkyMcp) > dist2D(thumbMcp, pinkyMcp) * 1.18 &&
    dist2D(thumbTip, indexMcp) > palmScale * 0.48;

  // Pinch: thumb tip & index tip close together while palm scale normalizes distance
  const pinchGap = dist2D(thumbTip, indexTip) / palmScale;
  if (pinchGap < 0.34 && (middleUp || ringUp || !indexUp)) {
    return 'pinch';
  }

  // Thumbs up: thumb extended upward (smaller Y in screen space) & all 4 fingers curled
  const thumbPointingUp =
    thumbTip.y < thumbIp.y - palmScale * 0.14 &&
    thumbTip.y < indexMcp.y - palmScale * 0.12 &&
    dist2D(thumbTip, thumbCmc) > palmScale * 0.65;
  if (thumbPointingUp && !indexUp && !middleUp && !ringUp && !pinkyUp) {
    return 'thumbs_up';
  }

  // Open palm: 4 fingers extended (or 3+ with thumb out)
  if (indexUp && middleUp && ringUp && pinkyUp) {
    return 'open_palm';
  }

  // Peace / V-Sign: index + middle extended, ring + pinky curled
  if (indexUp && middleUp && !ringUp && !pinkyUp) {
    return 'peace';
  }

  // Point: index extended, middle + ring + pinky curled
  if (indexUp && !middleUp && !ringUp && !pinkyUp) {
    return 'point';
  }

  // Fist: all four fingers curled and thumb tucked
  if (!indexUp && !middleUp && !ringUp && !pinkyUp && !thumbOut) {
    return 'fist';
  }

  // Soft fallback for near-fist / near-open poses
  const extendedCount =
    Number(indexUp) + Number(middleUp) + Number(ringUp) + Number(pinkyUp);
  if (extendedCount === 0) return 'fist';
  if (extendedCount >= 3 && thumbOut) return 'open_palm';

  return 'none';
}

export class SignStabilizer {
  private stableSign: HandSign = 'none';
  private candidateSign: HandSign = 'none';
  private candidateFrames = 0;
  private readonly requiredFrames: number;

  constructor(requiredFrames = 3) {
    this.requiredFrames = requiredFrames;
  }

  public update(rawSign: HandSign): HandSign {
    if (rawSign === this.stableSign) {
      this.candidateSign = rawSign;
      this.candidateFrames = 0;
      return this.stableSign;
    }

    if (rawSign === this.candidateSign) {
      this.candidateFrames += 1;
      if (this.candidateFrames >= this.requiredFrames) {
        this.stableSign = rawSign;
        this.candidateFrames = 0;
      }
    } else {
      this.candidateSign = rawSign;
      this.candidateFrames = 1;
    }
    return this.stableSign;
  }

  public reset(): void {
    this.stableSign = 'none';
    this.candidateSign = 'none';
    this.candidateFrames = 0;
  }
}

export const SIGN_LABELS: Record<HandSign, string> = {
  none: 'Neutral',
  open_palm: 'Open Palm',
  fist: 'Closed Fist',
  point: 'Point',
  peace: 'Peace / V',
  pinch: 'Pinch',
  thumbs_up: 'Thumbs Up',
};
