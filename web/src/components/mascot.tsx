import { cn } from "@/lib/utils";

/**
 * Pip — the Pawtella mascot. A friendly cat-dog hybrid, authored as a clean vector face that
 * matches the brand's reference mark (web/public/brand/pawtella-mascot-original.png): a thick,
 * round-capped deep-teal outline, a cream face, one pointy cat ear (left) and one folded dog ear
 * (right), simple oval eyes, a rounded nose, a cat "‿‿" smile, whiskers, freckles and a small
 * coral dot by the dog ear.
 *
 * `variant="full"` frames the whole face with room for a pose's small props (a waving paw, thought
 * dots, "z z z", sparkles, a tear) — used at hero / empty / loading / success / error moments.
 * `variant="mark"` is the tight head used in the logo lockup and app icons.
 *
 * Poses are expressed through the eyes, mouth, ear tilt and small props. Idle life (blink + ear
 * twitch) is on by default; `float` adds a gentle bob. Every animation is removed under
 * `prefers-reduced-motion` via the keyframes in globals.css.
 */
export type PipPose = "happy" | "wave" | "thinking" | "sleeping" | "celebrating" | "sad";

interface MascotProps extends Omit<React.ComponentProps<"svg">, "pose"> {
  pose?: PipPose;
  variant?: "full" | "mark";
  /** Idle blink / ear twitch (+ a wave when posing). Default true. Honours prefers-reduced-motion. */
  animate?: boolean;
  /** Gentle vertical bob — meaningful feedback for loading / hero moments. Default false. */
  float?: boolean;
  /** Accessible label. When omitted the mascot is decorative (aria-hidden). */
  title?: string;
}

const DEEP = "#0e7c7b";
const EAR = "#2f9794";
const EAR_HI = "#4aa8a3";
const EAR_HI2 = "#50aba6";
const CREAM = "#fdf1dc";
const CORAL = "#ff6b4a";
const CORAL_SOFT = "#ffd9cf";

const OPEN_EYE_POSES: ReadonlySet<PipPose> = new Set<PipPose>(["happy", "wave", "thinking"]);

export function Mascot({
  pose = "happy",
  variant = "full",
  animate = true,
  float = false,
  title,
  className,
  ...props
}: MascotProps) {
  const isMark = variant === "mark";
  const effectivePose: PipPose = isMark ? "happy" : pose;
  const labelled = Boolean(title);

  return (
    <svg
      viewBox={isMark ? "212 140 576 516" : "96 104 812 740"}
      className={cn("block h-auto w-24 overflow-visible", float && animate && "pip-float", className)}
      role={labelled ? "img" : undefined}
      aria-hidden={labelled ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <PipFace pose={effectivePose} animate={animate} />
      {!isMark && <Props pose={pose} animate={animate} />}
    </svg>
  );
}

function PipFace({ pose, animate }: { pose: PipPose; animate: boolean }) {
  return (
    <>
      <CatEar pose={pose} animate={animate} />

      {/* Face blob */}
      <path
        d="M410,250 C492,212 578,206 646,236 C720,266 782,338 778,428 C774,510 744,568 690,598 C630,632 558,636 498,633 C438,630 356,616 316,579 C282,549 267,500 272,439 C275,392 282,352 300,322 C318,280 350,256 410,250 Z"
        fill={CREAM}
        stroke={DEEP}
        strokeWidth={17}
        strokeLinejoin="round"
      />

      {/* Dog ear (right, folded) */}
      <path
        d="M636,226 C678,201 724,205 751,239 C780,274 789,338 778,400 C769,444 744,470 713,463 C688,457 670,424 658,386 C646,348 629,298 631,266 C632,248 630,234 636,226 Z"
        fill={EAR}
        stroke={DEEP}
        strokeWidth={17}
        strokeLinejoin="round"
      />
      <path
        d="M664,270 C694,260 719,274 727,316 C733,352 723,398 704,416 C689,409 676,376 668,340 C661,310 658,286 664,270 Z"
        fill={EAR_HI2}
      />

      {/* Coral dot */}
      <circle cx={713} cy={180} r={33} fill={CORAL} />

      {/* Eyes */}
      <g className={animate && OPEN_EYE_POSES.has(pose) ? "pip-eyes" : undefined}>
        <Eyes pose={pose} />
      </g>

      {/* Nose */}
      <path d="M468,434 C468,421 542,421 542,434 C542,457 517,480 505,480 C493,480 468,457 468,434 Z" fill={DEEP} />

      {/* Mouth */}
      <Mouth pose={pose} />

      {/* Whiskers */}
      <g fill="none" stroke={DEEP} strokeWidth={11} strokeLinecap="round">
        <path d="M318,472 C280,464 250,462 228,454" />
        <path d="M315,502 C276,502 246,504 224,502" />
        <path d="M322,532 C286,538 258,546 240,554" />
        <path d="M692,476 C726,470 750,470 768,464" />
        <path d="M696,504 C730,506 754,508 772,510" />
      </g>

      {/* Freckles */}
      <g fill={DEEP}>
        <circle cx={432} cy={480} r={8} />
        <circle cx={578} cy={480} r={8} />
      </g>
    </>
  );
}

function CatEar({ pose, animate }: { pose: PipPose; animate: boolean }) {
  const tilt = pose === "celebrating" ? -7 : pose === "wave" ? -4 : pose === "sad" ? 9 : 0;
  return (
    <g transform={tilt ? `rotate(${tilt} 330 312)` : undefined}>
      <g className={animate ? "pip-ear" : undefined}>
        <path
          d="M296,322 C286,268 282,206 300,150 C322,206 364,240 404,258 C372,300 330,320 296,322 Z"
          fill={EAR}
          stroke={DEEP}
          strokeWidth={17}
          strokeLinejoin="round"
        />
        <path
          d="M306,210 C302,254 304,294 312,314 C342,310 368,294 384,266 C360,240 334,222 306,210 Z"
          fill={EAR_HI}
          opacity={0.6}
        />
      </g>
    </g>
  );
}

function Eyes({ pose }: { pose: PipPose }) {
  if (pose === "sleeping") {
    return (
      <g fill="none" stroke={DEEP} strokeWidth={14} strokeLinecap="round">
        <path d="M388,406 Q416,430 444,406" />
        <path d="M572,406 Q600,430 628,406" />
      </g>
    );
  }
  if (pose === "celebrating") {
    return (
      <g fill="none" stroke={DEEP} strokeWidth={15} strokeLinecap="round">
        <path d="M388,410 Q416,382 444,410" />
        <path d="M572,410 Q600,382 628,410" />
      </g>
    );
  }
  if (pose === "sad") {
    return (
      <>
        <g fill={DEEP}>
          <ellipse cx={416} cy={412} rx={24} ry={30} />
          <ellipse cx={600} cy={412} rx={24} ry={30} />
        </g>
        <g fill="none" stroke={DEEP} strokeWidth={13} strokeLinecap="round">
          <path d="M386,372 Q410,366 432,378" />
          <path d="M618,372 Q594,366 572,378" />
        </g>
      </>
    );
  }
  // open eyes (happy, wave, thinking) — thinking glances up a touch
  const cy = pose === "thinking" ? 398 : 404;
  return (
    <g fill={DEEP}>
      <ellipse cx={416} cy={cy} rx={26} ry={35} />
      <ellipse cx={600} cy={cy} rx={26} ry={35} />
    </g>
  );
}

function Mouth({ pose }: { pose: PipPose }) {
  if (pose === "sad") {
    return (
      <g fill="none" stroke={DEEP} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round">
        <path d="M505,480 L505,500" />
        <path d="M470,524 Q505,500 540,524" />
      </g>
    );
  }
  if (pose === "sleeping") {
    return (
      <g fill="none" stroke={DEEP} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round">
        <path d="M505,484 L505,502" />
        <path d="M486,506 Q505,520 524,506" />
      </g>
    );
  }
  if (pose === "celebrating") {
    return (
      <g stroke={DEEP} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round">
        <path d="M505,480 L505,498" fill="none" />
        <path d="M466,500 Q505,556 544,500 Q505,516 466,500 Z" fill={DEEP} />
      </g>
    );
  }
  if (pose === "thinking") {
    return (
      <g fill="none" stroke={DEEP} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round">
        <path d="M505,482 L505,506" />
        <path d="M486,510 Q505,524 524,510" />
      </g>
    );
  }
  // happy / wave — cat smile
  return (
    <g fill="none" stroke={DEEP} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round">
      <path d="M505,482 L505,506" />
      <path d="M505,506 C498,530 470,532 456,512" />
      <path d="M505,506 C512,530 540,532 554,512" />
    </g>
  );
}

function Paw({ x, y, rot, scale, animate }: { x: number; y: number; rot: number; scale: number; animate: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${scale})`}>
      <g className={animate ? "pip-wave" : undefined}>
        <path
          d="M-33,8 C-39,-18 -23,-40 0,-40 C23,-40 39,-18 33,8 C29,32 15,42 0,42 C-15,42 -29,32 -33,8 Z"
          fill={CORAL}
          stroke={DEEP}
          strokeWidth={13}
          strokeLinejoin="round"
        />
        <g fill={CORAL_SOFT}>
          <ellipse cx={-16} cy={-16} rx={7.5} ry={9.5} />
          <ellipse cx={0} cy={-22} rx={7.5} ry={9.5} />
          <ellipse cx={16} cy={-16} rx={7.5} ry={9.5} />
          <ellipse cx={0} cy={8} rx={15} ry={13} />
        </g>
      </g>
    </g>
  );
}

function Spark({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  const d = r * 0.28;
  return (
    <path
      d={`M${x},${y - r} L${x + d},${y - d} L${x + r},${y} L${x + d},${y + d} L${x},${y + r} L${x - d},${y + d} L${x - r},${y} L${x - d},${y - d} Z`}
      fill={color}
    />
  );
}

function Props({ pose, animate }: { pose: PipPose; animate: boolean }) {
  if (pose === "wave") {
    return <Paw x={828} y={492} rot={-6} scale={1.22} animate={animate} />;
  }
  if (pose === "thinking") {
    return (
      <g className={animate ? "pip-dots" : undefined} fill={DEEP}>
        <circle cx={812} cy={252} r={12} />
        <circle cx={856} cy={214} r={15} />
        <circle cx={900} cy={172} r={19} />
      </g>
    );
  }
  if (pose === "sleeping") {
    return (
      <g fill="none" stroke={DEEP} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round">
        <path d="M792,250 h30 l-30,30 h30" />
        <path d="M838,206 h38 l-38,38 h38" />
        <path d="M890,150 h46 l-46,46 h46" />
      </g>
    );
  }
  if (pose === "celebrating") {
    return (
      <g className={animate ? "pip-sparkle" : undefined}>
        <Spark x={300} y={150} r={30} color={CORAL} />
        <Spark x={760} y={150} r={22} color={DEEP} />
        <Spark x={792} y={470} r={20} color={CORAL} />
      </g>
    );
  }
  if (pose === "sad") {
    return (
      <path
        d="M402,452 C402,470 388,478 388,494 C388,506 416,506 416,494 C416,478 402,470 402,452 Z"
        fill={EAR_HI2}
      />
    );
  }
  return null;
}
