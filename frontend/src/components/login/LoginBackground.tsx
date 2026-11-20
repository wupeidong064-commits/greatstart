import { useEffect, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { interpolate, useCurrentFrame } from 'remotion';
import { CalendarDays, CircleCheck, ClipboardCheck, GraduationCap, UserRound, UsersRound } from 'lucide-react';

export const IMPRINT_WIDTH = 1400;
export const IMPRINT_HEIGHT = 560;
export const IMPRINT_FRAMES = 120;
export const IMPRINT_FPS = 30;

const pen = '#d0cde4';
const ink = '#ada4cc';
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
function reveal(frame: number, start: number, duration = 28) {
  const value = interpolate(frame, [start, start + duration], [0, 1], clamp);
  return 1 - (1 - value) ** 3;
}
function DrawnLine({ d, frame, start = 0, duration = 40, opacity = 1 }: {
  d: string; frame: number; start?: number; duration?: number; opacity?: number;
}) {
  const progress = reveal(frame, start, duration);
  return <path d={d} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - progress}
    fill="none" stroke={pen} strokeWidth={1.25} strokeLinecap="round"
    opacity={progress === 0 ? 0 : opacity} />;
}

/** Decorative diagram, not a simulated business dashboard. Final frame is also the static poster. */
export function ImprintScene({ frame }: { frame: number }) {
  const outer = reveal(frame, 0, 44);
  const title = reveal(frame, 14, 24);
  const nodes = [
    { x: 1008, y: 156, radius: 33, Icon: UserRound, start: 40 },
    { x: 1312, y: 168, radius: 37, Icon: ClipboardCheck, start: 50 },
    { x: 1015, y: 389, radius: 29, Icon: UsersRound, start: 66 },
    { x: 1300, y: 387, radius: 30, Icon: CircleCheck, start: 82 },
  ];
  return <svg viewBox={`0 0 ${IMPRINT_WIDTH} ${IMPRINT_HEIGHT}`} width="100%" height="100%"
    xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true" data-imprint-frame={frame}>
    <g data-imprint-part="schedule" transform="rotate(-8 250 280)">
      <rect x="92" y="142" width="320" height="274" rx="18" stroke={pen} strokeWidth="1.3"
        pathLength={1} strokeDasharray={1} strokeDashoffset={1 - outer} opacity={outer === 0 ? 0 : .95} />
      <g opacity={title * .85}>
        <CalendarDays x={111} y={164} width={20} height={20} style={{ width: 20, height: 20 }} color={ink} strokeWidth={1.25} />
        <text x="141" y="180" fill={ink} fontSize="14" letterSpacing="2">每一节课</text>
        <path d="M354 174h25m-25 6h17" stroke={pen} strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <DrawnLine d="M93 199H411" frame={frame} start={13} duration={36} />
      {['一', '二', '三', '四'].map((day, index) => <text key={day} x={135 + index * 73} y="222"
        textAnchor="middle" fill={ink} fontSize="12" opacity={reveal(frame, 22 + index * 3) * .65}>{day}</text>)}
      {[107, 180, 253, 326, 399].map((x, index) => <DrawnLine key={`v${x}`} d={`M${x} 233V405`}
        frame={frame} start={22 + index * 4} duration={42} opacity={.65} />)}
      {[233, 291, 349, 405].map((y, index) => <DrawnLine key={`h${y}`} d={`M107 ${y}H399`}
        frame={frame} start={28 + index * 5} duration={36} opacity={.65} />)}
      {[
        [115, 242, 43], [261, 242, 49], [188, 300, 57], [334, 300, 65], [261, 358, 73], [115, 358, 81],
      ].map(([x, y, start], index) => {
        const progress = reveal(frame, start, 25);
        return <g key={index} opacity={progress} transform={`translate(0 ${(1 - progress) * 8})`}>
          <rect x={x} y={y} width="56" height="38" rx="7" fill={index % 2 ? '#c9c2eb' : '#bbc4e7'} fillOpacity=".21"
            stroke={pen} strokeOpacity=".65" strokeWidth=".8" />
          <path d={`M${x + 11} ${y + 15}h23m-23 8h15`} stroke={ink} strokeWidth="1" opacity=".45" strokeLinecap="round" />
        </g>;
      })}
      <g opacity={reveal(frame, 83, 27) * .65}>
        <circle cx="393" cy="396" r="15" fill="#f8f7fd" stroke={pen} />
        <CircleCheck x={384} y={387} width={18} height={18} style={{ width: 18, height: 18 }} color={ink} strokeWidth={1.25} />
      </g>
    </g>
    <DrawnLine d="M48 439C90 465 146 476 209 466" frame={frame} start={60} duration={45} opacity={.45} />
    <circle cx="227" cy="463" r="3" fill={pen} opacity={reveal(frame, 98, 15) * .6} />
    <g data-imprint-part="teaching">
      <DrawnLine d="M1034 177C1066 204 1082 214 1103 236" frame={frame} start={27} duration={37} opacity={.8} />
      <DrawnLine d="M1277 185C1244 204 1234 220 1210 238" frame={frame} start={35} duration={40} opacity={.8} />
      <DrawnLine d="M1039 372C1064 351 1085 329 1110 307" frame={frame} start={49} duration={42} opacity={.8} />
      <DrawnLine d="M1276 367C1243 348 1228 325 1202 311" frame={frame} start={65} duration={43} opacity={.8} />
      <g opacity={reveal(frame, 8, 34)}>
        <circle cx="1155" cy="270" r="64" stroke={pen} strokeWidth="1.3" fill="#f2f0fa" fillOpacity=".24" />
        <circle cx="1155" cy="270" r="83" stroke={pen} strokeWidth=".8" strokeDasharray="3 12" opacity=".45" />
        <GraduationCap x={1133} y={247} width={44} height={44} style={{ width: 44, height: 44 }} color={ink} strokeWidth={1.15} opacity={.8} />
      </g>
      {nodes.map(({ x, y, radius, Icon, start }, index) => {
        const progress = reveal(frame, start, 28);
        return <g key={index} opacity={progress} transform={`translate(0 ${(1 - progress) * 6})`}>
          <circle cx={x} cy={y} r={radius} stroke={pen} strokeWidth="1.15" fill="#f8f8fd" fillOpacity=".45" />
          <Icon x={x - 12} y={y - 12} width={24} height={24} style={{ width: 24, height: 24 }} color={ink} strokeWidth={1.15} opacity=".82" />
        </g>;
      })}
      <DrawnLine d="M1277 91C1307 93 1335 109 1349 131" frame={frame} start={65} duration={40} opacity={.4} />
      <circle cx="1259" cy="92" r="3" fill={pen} opacity={reveal(frame, 91, 18) * .6} />
    </g>
  </svg>;
}

function ImprintComposition() { return <ImprintScene frame={useCurrentFrame()} />; }

/** Plays once, then removes the Player and leaves the same final SVG with no playback loop. */
export default function LoginBackground() {
  const [player, setPlayer] = useState<PlayerRef | null>(null);
  const [settled, setSettled] = useState(() => typeof window === 'undefined' ||
    window.matchMedia('(prefers-reduced-motion: reduce), (max-width: 1000px), (max-height: 560px)').matches);
  useEffect(() => {
    if (settled) return;
    const current = player;
    if (!current) return;
    const finish = () => setSettled(true);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionChanged = () => { if (media.matches) finish(); };
    const visibilityChanged = () => {
      if (document.hidden) current.pause();
      else current.play();
    };
    current.addEventListener('ended', finish);
    current.addEventListener('error', finish);
    media.addEventListener('change', motionChanged);
    document.addEventListener('visibilitychange', visibilityChanged);
    // This decorative composition has no audio. Without explicit mute, browsers
    // can suspend the audio clock and leave both drawings waiting at frame zero.
    current.mute();
    // Explicitly start after Strict Mode replays mount effects in the application.
    if (document.hidden) current.pause();
    else current.play();
    return () => {
      current.removeEventListener('ended', finish);
      current.removeEventListener('error', finish);
      media.removeEventListener('change', motionChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [settled, player]);
  return <div className="imprint-surface" data-imprint-state={settled ? 'settled' : 'playing'}>
    {settled ? <ImprintScene frame={IMPRINT_FRAMES - 1} /> : <Player ref={setPlayer}
      component={ImprintComposition} durationInFrames={IMPRINT_FRAMES} fps={IMPRINT_FPS}
      compositionWidth={IMPRINT_WIDTH} compositionHeight={IMPRINT_HEIGHT}
      autoPlay initiallyMuted loop={false} controls={false} moveToBeginningWhenEnded={false}
      clickToPlay={false} doubleClickToFullscreen={false} spaceKeyToPlayOrPause={false}
      allowFullscreen={false} numberOfSharedAudioTags={0}
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />}
  </div>;
}
