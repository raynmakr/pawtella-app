import { cn } from "@/lib/utils";

/**
 * Pip — the Pawtella mascot. A friendly cat-dog hybrid, authored as a clean vector face that
 * matches the brand's reference mark (web/public/brand/pawtella-mascot-original.png): a thick,
 * round-capped coral outline, a cream face, one pointy cat ear (left) and one folded dog ear
 * (right), simple oval eyes, a rounded nose, a cat "‿‿" smile, whiskers, freckles and a small
 * coral dot by the dog ear.
 *
 * Geometry is traced from the reference bitmap (1024px space) so the component shares that mark's
 * coordinates. The head is a single rounded blob; the cat ear is a separate path whose base edge is
 * the exact reverse of the head's top-left shoulder, so the two thick strokes coincide and the ear
 * joins the head with no seam — while still being its own group so a pose can tilt it. The folded
 * dog ear sits behind the head and pokes out to the right.
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

// Brand coral outline + warm ear tints — matches the site's primary accent
// (--primary #ff6b4a, the + button and active Ask tab). The outline is the
// most saturated coral; the ears step lighter so the shape still reads.
const DEEP = "#ff6b4a";
const EAR = "#ff8a6e";
const EAR_HI = "#ffa088";
const EAR_HI2 = "#ffb49e";
const CREAM = "#fdf1dc";
const CORAL = "#ff6b4a";
const CORAL_SOFT = "#ffd9cf";

/** Thick, round-capped outline — measured ~23px in the 1024px reference space. */
const STROKE = 23;

// Head blob (no ear): the top-left runs as a smooth shoulder from (304,250) to (436,232).
const HEAD_PATH =
  "M304,250 C330,242 392,234 436,232 C500,236 560,236 660,244 C708,258 724,300 720,352 " +
  "C726,410 724,472 706,520 C684,566 648,592 600,606 C540,624 430,628 360,606 " +
  "C318,590 296,556 286,512 C274,470 270,420 282,350 C276,300 290,256 304,250 Z";
// Cat ear — its base edge (436,232)→(304,250) is the exact reverse of the head shoulder, so the
// two strokes coincide and the join is seamless.
const CAT_EAR_PATH =
  "M304,250 C300,206 318,158 334,150 C340,145 344,148 348,156 C374,182 410,214 436,232 " +
  "C392,234 330,242 304,250 Z";
const CAT_EAR_HI_PATH =
  "M322,196 C314,224 312,244 318,250 C354,246 392,238 412,228 C388,206 352,190 336,186 " +
  "C330,185 326,188 322,196 Z";
// Folded dog ear (behind head): a small fold-nub top-left, a leaf bulging right, pointed at bottom.
const DOG_EAR_PATH =
  "M606,240 C624,212 646,202 660,210 C668,216 666,232 656,248 C700,258 740,278 756,316 " +
  "C766,344 756,380 732,404 C712,426 698,442 688,450 C676,436 666,406 658,366 " +
  "C650,328 644,286 632,262 C622,248 600,252 606,240 Z";
const DOG_EAR_HI_PATH =
  "M664,266 C698,274 730,298 740,332 C748,360 738,392 718,408 C702,394 688,360 680,320 " +
  "C672,288 662,272 664,266 Z";
const NOSE_PATH = "M470,430 C470,416 544,416 544,430 C544,454 519,478 507,478 C495,478 470,454 470,430 Z";

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
      viewBox={isMark ? "224 128 544 540" : "96 104 812 740"}
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
      {/* Folded dog ear (right), drawn behind the head so it only pokes out to the side */}
      <path d={DOG_EAR_PATH} fill={EAR} stroke={DEEP} strokeWidth={STROKE} strokeLinejoin="round" />
      <path d={DOG_EAR_HI_PATH} fill={EAR_HI2} />

      {/* Face blob */}
      <path d={HEAD_PATH} fill={CREAM} stroke={DEEP} strokeWidth={STROKE} strokeLinejoin="round" />

      {/* Pointy cat ear (left) — seamless with the head, tiltable for poses */}
      <CatEar pose={pose} animate={animate} />

      {/* Coral dot */}
      <circle cx={710} cy={192} r={31} fill={CORAL} />

      {/* Eyes */}
      <g className={animate && OPEN_EYE_POSES.has(pose) ? "pip-eyes" : undefined}>
        <Eyes pose={pose} />
      </g>

      {/* Nose */}
      <path d={NOSE_PATH} fill={DEEP} />

      {/* Mouth */}
      <Mouth pose={pose} />

      {/* Whiskers */}
      <g fill="none" stroke={DEEP} strokeWidth={11} strokeLinecap="round">
        <path d="M320,470 C286,462 258,460 236,452" />
        <path d="M318,500 C282,500 254,502 232,500" />
        <path d="M324,530 C290,536 264,544 246,552" />
        <path d="M694,474 C724,468 748,468 766,462" />
        <path d="M696,502 C726,504 750,506 768,508" />
      </g>

      {/* Freckles */}
      <g fill={DEEP}>
        <circle cx={403} cy={469} r={8} />
        <circle cx={621} cy={469} r={8} />
      </g>
    </>
  );
}

function CatEar({ pose, animate }: { pose: PipPose; animate: boolean }) {
  const tilt = pose === "celebrating" ? -7 : pose === "wave" ? -4 : pose === "sad" ? 9 : 0;
  return (
    <g transform={tilt ? `rotate(${tilt} 370 246)` : undefined}>
      <g className={animate ? "pip-ear" : undefined}>
        <path d={CAT_EAR_PATH} fill={EAR} stroke={DEEP} strokeWidth={STROKE} strokeLinejoin="round" />
        <path d={CAT_EAR_HI_PATH} fill={EAR_HI} />
      </g>
    </g>
  );
}

function Eyes({ pose }: { pose: PipPose }) {
  if (pose === "sleeping") {
    return (
      <g fill="none" stroke={DEEP} strokeWidth={14} strokeLinecap="round">
        <path d="M388,400 Q416,424 444,400" />
        <path d="M579,400 Q607,424 635,400" />
      </g>
    );
  }
  if (pose === "celebrating") {
    return (
      <g fill="none" stroke={DEEP} strokeWidth={15} strokeLinecap="round">
        <path d="M388,404 Q416,376 444,404" />
        <path d="M579,404 Q607,376 635,404" />
      </g>
    );
  }
  if (pose === "sad") {
    return (
      <>
        <g fill={DEEP}>
          <ellipse cx={416} cy={406} rx={22} ry={28} />
          <ellipse cx={607} cy={406} rx={22} ry={28} />
        </g>
        <g fill="none" stroke={DEEP} strokeWidth={13} strokeLinecap="round">
          <path d="M386,366 Q410,360 432,372" />
          <path d="M625,366 Q601,360 579,372" />
        </g>
      </>
    );
  }
  // open eyes (happy, wave, thinking) — thinking glances up a touch
  const cy = pose === "thinking" ? 392 : 398;
  return (
    <g fill={DEEP}>
      <ellipse cx={416} cy={cy} rx={23} ry={28} />
      <ellipse cx={607} cy={cy} rx={23} ry={28} />
    </g>
  );
}

function Mouth({ pose }: { pose: PipPose }) {
  if (pose === "sad") {
    return (
      <g fill="none" stroke={DEEP} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round">
        <path d="M507,478 L507,500" />
        <path d="M472,524 Q507,500 542,524" />
      </g>
    );
  }
  if (pose === "sleeping") {
    return (
      <g fill="none" stroke={DEEP} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round">
        <path d="M507,480 L507,500" />
        <path d="M488,504 Q507,518 526,504" />
      </g>
    );
  }
  if (pose === "celebrating") {
    return (
      <g stroke={DEEP} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round">
        <path d="M507,478 L507,496" fill="none" />
        <path d="M468,498 Q507,554 546,498 Q507,514 468,498 Z" fill={DEEP} />
      </g>
    );
  }
  if (pose === "thinking") {
    return (
      <g fill="none" stroke={DEEP} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round">
        <path d="M507,478 L507,504" />
        <path d="M488,508 Q507,522 526,508" />
      </g>
    );
  }
  // happy / wave — cat smile
  return (
    <g fill="none" stroke={DEEP} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round">
      <path d="M507,478 L507,502" />
      <path d="M507,502 C500,528 470,530 456,508" />
      <path d="M507,502 C514,528 544,530 558,508" />
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
