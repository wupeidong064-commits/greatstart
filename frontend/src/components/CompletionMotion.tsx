import { Player } from '@remotion/player';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Check } from 'lucide-react';

/** A finite 900ms composition. No ambient playback or audio. */
function CompletionComposition() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { stiffness: 220, damping: 18, mass: .7 } });
  const ring = interpolate(frame, [0, 24], [.45, 1.35], { extrapolateRight: 'clamp' });
  const opacity = interpolate(frame, [0, 5, 26], [0, .7, 0], { extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--ok)' }}>
    <div style={{ position: 'absolute', width: 44, height: 44, border: '1px solid currentColor', borderRadius: '50%', opacity, transform: `scale(${ring})` }} />
    <div style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: '50%', background: 'var(--ok-bg)', transform: `scale(${pop})` }}>
      <Check size={19} strokeWidth={2} />
    </div>
  </AbsoluteFill>;
}

export default function CompletionMotion() {
  return <div className="focus-completion-motion" aria-hidden="true"><Player component={CompletionComposition} durationInFrames={27} fps={30}
    compositionWidth={64} compositionHeight={64} autoPlay controls={false} loop={false}
    clickToPlay={false} doubleClickToFullscreen={false} spaceKeyToPlayOrPause={false}
    style={{ width: 56, height: 56, pointerEvents: 'none' }} /></div>;
}
