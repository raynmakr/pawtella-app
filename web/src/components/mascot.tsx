import { cn } from "@/lib/utils";

/**
 * Pip — the Pawtella mascot. A friendly cat-dog hybrid, identifiable as a hybrid by its
 * ears: one pointy cat ear (left) and one floppy dog ear (right). Hand-authored SVG.
 *
 * `variant="full"` is the seated figure for hero / empty / loading / success moments.
 * `variant="mark"` is the head-only lockup used in the logo tile and app icons.
 *
 * Idle animation (blink, ear twitch, tail wag) is on by default and is fully disabled
 * under `prefers-reduced-motion` via the keyframes in globals.css. `float` adds a gentle
 * bob for loading / hero use.
 */
export type PipPose = "happy" | "wave" | "thinking" | "sleeping" | "celebrating" | "sad";

interface MascotProps extends Omit<React.ComponentProps<"svg">, "pose"> {
  pose?: PipPose;
  variant?: "full" | "mark";
  /** Idle blink / ear twitch / tail wag. Default true. Always honours prefers-reduced-motion. */
  animate?: boolean;
  /** Gentle vertical bob — meaningful feedback for loading / hero moments. Default false. */
  float?: boolean;
  /** Accessible label. When omitted the mascot is decorative (aria-hidden). */
  title?: string;
}

const ROUND_EYE_POSES: ReadonlySet<PipPose> = new Set<PipPose>(["happy", "wave", "thinking"]);

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
  const roundEyes = ROUND_EYE_POSES.has(pose);
  const labelled = Boolean(title);

  return (
    <svg
      viewBox={isMark ? "24 2 112 112" : "0 0 160 170"}
      className={cn("block h-auto w-24 overflow-visible", float && animate && "pip-float", className)}
      role={labelled ? "img" : undefined}
      aria-hidden={labelled ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}

      {!isMark && (
        <>
          {/* Tail — curls out bottom-left */}
          <g className={animate ? "pip-tail" : undefined}>
            <path d="M50,118 C18,116 8,92 20,78 C26,71 36,74 35,84 C34,95 42,104 56,108 Z" fill="#ef5d3f" />
            <ellipse cx="22" cy="80" rx="8" ry="7" fill="#fff3e9" />
          </g>
          {/* Body */}
          <ellipse cx="80" cy="120" rx="44" ry="36" fill="#ff6b4a" />
          <ellipse cx="80" cy="128" rx="26" ry="24" fill="#fff3e9" />
          <ellipse cx="60" cy="150" rx="13" ry="9" fill="#fff3e9" />
          <ellipse cx="100" cy="150" rx="13" ry="9" fill="#fff3e9" />
        </>
      )}

      {/* Dog ear (right, floppy) */}
      <path
        d="M96,34 C120,24 140,40 137,70 C135,92 126,108 112,104 C101,101 99,80 98,64 C97,50 90,41 96,34 Z"
        fill="#ef5d3f"
      />
      <path
        d="M104,48 C120,42 129,54 127,72 C125,88 118,98 110,94 C104,91 105,74 105,64 C105,54 100,51 104,48 Z"
        fill="#ffd9cf"
      />

      {/* Cat ear (left, pointy) */}
      <g className={animate ? "pip-ear" : undefined}>
        <path d="M68,34 L34,4 Q29,1 30,8 L40,56 Z" fill="#ff6b4a" />
        <path d="M62,36 L40,15 Q37,13 38,19 L45,50 Z" fill="#ffd9cf" />
      </g>

      {/* Head */}
      <circle cx="80" cy="66" r="44" fill="#ff6b4a" />
      <path d="M42,54 A44,44 0 0 1 118,54 C104,47 56,47 42,54 Z" fill="#ff7a5c" />

      {/* Muzzle + cheeks */}
      <ellipse cx="80" cy="84" rx="31" ry="23" fill="#fff3e9" />
      <ellipse cx="50" cy="83" rx="8" ry="5" fill="#ff9f87" opacity="0.55" />
      <ellipse cx="110" cy="83" rx="8" ry="5" fill="#ff9f87" opacity="0.55" />

      {/* Eyes */}
      <g className={animate && roundEyes ? "pip-eyes" : undefined}>
        <Eyes pose={pose} />
      </g>

      {/* Nose */}
      <path d="M80,73 C85,73 87,77 83,80 C81,82 79,82 77,80 C73,77 75,73 80,73 Z" fill="#7a4a3a" />

      {/* Mouth + per-pose extras */}
      <Mouth pose={pose} />

      {!isMark && (
        <>
          {/* Collar + Paw Points tag */}
          <path d="M52,104 C62,112 98,112 108,104 L106,112 C96,119 64,119 54,112 Z" fill="#0e7c7b" />
          <circle cx="80" cy="114" r="6.5" fill="#f5a623" stroke="#fff3e9" strokeWidth="1.5" />
          <Accessories pose={pose} animate={animate} />
        </>
      )}
    </svg>
  );
}

function Eyes({ pose }: { pose: PipPose }) {
  if (pose === "celebrating") {
    return (
      <>
        <path d="M56,66 Q64,57 72,66" fill="none" stroke="#2a211b" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M88,66 Q96,57 104,66" fill="none" stroke="#2a211b" strokeWidth="3.2" strokeLinecap="round" />
      </>
    );
  }
  if (pose === "sleeping") {
    return (
      <>
        <path d="M56,64 Q64,71 72,64" fill="none" stroke="#2a211b" strokeWidth="3" strokeLinecap="round" />
        <path d="M88,64 Q96,71 104,64" fill="none" stroke="#2a211b" strokeWidth="3" strokeLinecap="round" />
      </>
    );
  }
  if (pose === "sad") {
    return (
      <>
        <circle cx="64" cy="66" r="6.5" fill="#2a211b" />
        <circle cx="62" cy="64" r="2.1" fill="#fff" />
        <circle cx="96" cy="66" r="6.5" fill="#2a211b" />
        <circle cx="94" cy="64" r="2.1" fill="#fff" />
        <path d="M55,54 Q63,50 70,55" fill="none" stroke="#7a4a3a" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M105,54 Q97,50 90,55" fill="none" stroke="#7a4a3a" strokeWidth="2.6" strokeLinecap="round" />
      </>
    );
  }
  // thinking looks up; happy / wave look ahead
  const glintY = pose === "thinking" ? 60 : 61.5;
  const glintDx = pose === "thinking" ? 0 : -2.5;
  return (
    <>
      <circle cx="64" cy="64" r="7.5" fill="#2a211b" />
      <circle cx={64 + glintDx} cy={glintY} r="2.5" fill="#fff" />
      <circle cx="96" cy="64" r="7.5" fill="#2a211b" />
      <circle cx={96 + glintDx} cy={glintY} r="2.5" fill="#fff" />
    </>
  );
}

function Mouth({ pose }: { pose: PipPose }) {
  if (pose === "celebrating") {
    return (
      <>
        <path d="M80,80 L80,83" stroke="#7a4a3a" strokeWidth="2" strokeLinecap="round" />
        <path d="M70,85 Q80,99 90,85 Q80,89 70,85 Z" fill="#b2503c" stroke="#7a4a3a" strokeWidth="2.2" strokeLinejoin="round" />
      </>
    );
  }
  if (pose === "sad") {
    return (
      <>
        {/* tear */}
        <path d="M70,74 C70,80 66,82 66,86 C66,89 74,89 74,86 C74,82 70,80 70,74 Z" fill="#6fc5e6" opacity="0.9" />
        <path d="M80,80 L80,83" stroke="#7a4a3a" strokeWidth="2" strokeLinecap="round" />
        <path d="M73,90 Q80,83 87,90" fill="none" stroke="#7a4a3a" strokeWidth="2.4" strokeLinecap="round" />
      </>
    );
  }
  if (pose === "thinking" || pose === "sleeping") {
    return (
      <>
        <path d="M80,81 L80,84" stroke="#7a4a3a" strokeWidth="2" strokeLinecap="round" />
        <path d="M74,88 Q80,90 86,88" fill="none" stroke="#7a4a3a" strokeWidth="2.2" strokeLinecap="round" />
      </>
    );
  }
  // happy / wave
  return (
    <>
      <path d="M80,81 L80,84" stroke="#7a4a3a" strokeWidth="2" strokeLinecap="round" />
      <path d="M72,85 Q80,94 88,85" fill="none" stroke="#7a4a3a" strokeWidth="2.4" strokeLinecap="round" />
    </>
  );
}

function Accessories({ pose, animate }: { pose: PipPose; animate: boolean }) {
  if (pose === "wave") {
    return (
      <g className={animate ? "pip-wave" : undefined}>
        <path d="M54,104 C44,96 38,80 37,64" fill="none" stroke="#ff6b4a" strokeWidth="15" strokeLinecap="round" />
        <ellipse cx="35" cy="57" rx="13" ry="14" fill="#ff7a5c" />
        <ellipse cx="35" cy="60" rx="7" ry="8" fill="#ffd9cf" />
      </g>
    );
  }
  if (pose === "thinking") {
    return (
      <g className={animate ? "pip-dots" : undefined} fill="#0e7c7b">
        <circle cx="120" cy="30" r="3.5" />
        <circle cx="134" cy="23" r="4.5" />
        <circle cx="150" cy="17" r="5.5" />
      </g>
    );
  }
  if (pose === "sleeping") {
    return (
      <g fill="none" stroke="#0e7c7b" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M110,44 h7 l-7,7 h7" />
        <path d="M124,30 h9 l-9,9 h9" />
        <path d="M140,14 h11 l-11,11 h11" />
      </g>
    );
  }
  if (pose === "celebrating") {
    return (
      <>
        <g className={animate ? "pip-cheer" : undefined}>
          <path d="M52,103 C42,92 37,78 37,62" fill="none" stroke="#ff6b4a" strokeWidth="14" strokeLinecap="round" />
          <ellipse cx="36" cy="55" rx="12" ry="13" fill="#ff7a5c" />
          <ellipse cx="36" cy="58" rx="6.5" ry="7.5" fill="#ffd9cf" />
          <path d="M108,103 C120,92 128,78 131,62" fill="none" stroke="#ff6b4a" strokeWidth="14" strokeLinecap="round" />
          <ellipse cx="133" cy="55" rx="12" ry="13" fill="#ff7a5c" />
          <ellipse cx="133" cy="58" rx="6.5" ry="7.5" fill="#ffd9cf" />
        </g>
        <g className={animate ? "pip-sparkle" : undefined}>
          <path d="M22,40 l2.2,6.5 6.5,2.2 -6.5,2.2 -2.2,6.5 -2.2,-6.5 -6.5,-2.2 6.5,-2.2 Z" fill="#f5a623" />
          <path d="M150,34 l1.7,5 5,1.7 -5,1.7 -1.7,5 -1.7,-5 -5,-1.7 5,-1.7 Z" fill="#f5a623" />
          <path d="M146,96 l1.5,4.5 4.5,1.5 -4.5,1.5 -1.5,4.5 -1.5,-4.5 -4.5,-1.5 4.5,-1.5 Z" fill="#0e7c7b" />
        </g>
      </>
    );
  }
  return null;
}
