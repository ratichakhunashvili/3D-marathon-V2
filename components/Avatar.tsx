import { decodePreset, type Palette, type Shape } from "@/lib/avatars";

type AvatarSource = {
  name: string;
  avatar_type: "preset" | "upload";
  avatar_value: string;
};

/**
 * Draws a team icon. Preset icons are pure SVG built from the id (no files, no requests);
 * an uploaded icon is streamed from Drive through /api/avatar.
 *
 * Gradient ids are derived from the preset id, so the same icon twice on a page emits an
 * identical <defs> twice — harmless, and it keeps this a plain server component.
 */
export function Avatar({
  account,
  size = 40,
  round = false,
  className = "",
}: {
  account: AvatarSource;
  size?: number;
  round?: boolean;
  className?: string;
}) {
  const classes = `avatar${round ? " avatar-round" : ""}${className ? ` ${className}` : ""}`;

  if (account.avatar_type === "upload" && account.avatar_value) {
    return (
      <span className={classes} style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Drive-streamed, not a build-time asset */}
        <img src={`/api/avatar/${encodeURIComponent(account.avatar_value)}`} alt={account.name} />
      </span>
    );
  }

  return (
    <span className={classes} style={{ width: size, height: size }}>
      <PresetIcon id={account.avatar_value} size={size} />
    </span>
  );
}

export function PresetIcon({ id, size = 40 }: { id: string; size?: number }) {
  const { shape, palette } = decodePreset(id);
  const gid = `av-${id.replace(/[^a-z0-9-]/gi, "")}`;

  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-hidden="true">
      <defs>
        <linearGradient id={`${gid}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.bgFrom} />
          <stop offset="100%" stopColor={palette.bgTo} />
        </linearGradient>
        <radialGradient id={`${gid}-ball`} cx="0.35" cy="0.3" r="0.85">
          <stop offset="0%" stopColor={palette.top} />
          <stop offset="55%" stopColor={palette.left} />
          <stop offset="100%" stopColor={palette.right} />
        </radialGradient>
      </defs>
      <rect width="64" height="64" fill={`url(#${gid}-bg)`} />
      <ShapeArt shape={shape} palette={palette} gid={gid} />
    </svg>
  );
}

function ShapeArt({ shape, palette, gid }: { shape: Shape; palette: Palette; gid: string }) {
  const { top, left, right, line } = palette;

  switch (shape) {
    case "cube":
      return (
        <g>
          <polygon points="32,12 52,24 32,36 12,24" fill={top} />
          <polygon points="12,24 32,36 32,54 12,42" fill={left} />
          <polygon points="52,24 52,42 32,54 32,36" fill={right} />
          <polyline points="12,24 32,36 52,24" fill="none" stroke={line} strokeOpacity="0.35" strokeWidth="1" />
        </g>
      );

    case "pyramid":
      return (
        <g>
          <polygon points="32,10 12,42 32,52" fill={left} />
          <polygon points="32,10 52,42 32,52" fill={right} />
          <polygon points="12,42 32,52 52,42 32,37" fill={top} fillOpacity="0.55" />
          <line x1="32" y1="10" x2="32" y2="52" stroke={line} strokeOpacity="0.3" strokeWidth="1" />
        </g>
      );

    case "sphere":
      return (
        <g>
          <circle cx="32" cy="32" r="19" fill={`url(#${gid}-ball)`} />
          <ellipse cx="25" cy="24" rx="6" ry="4" fill={line} fillOpacity="0.45" transform="rotate(-25 25 24)" />
        </g>
      );

    case "torus":
      return (
        <g>
          <ellipse cx="32" cy="34" rx="20" ry="12" fill="none" stroke={right} strokeWidth="10" />
          <ellipse cx="32" cy="32" rx="20" ry="12" fill="none" stroke={left} strokeWidth="9" />
          <ellipse cx="32" cy="30" rx="20" ry="12" fill="none" stroke={top} strokeWidth="3" strokeOpacity="0.8" />
        </g>
      );

    case "cylinder":
      return (
        <g>
          <path d="M14 20 h36 v24 a18 8 0 0 1 -36 0 z" fill={left} />
          <path d="M32 52 a18 8 0 0 0 18 -8 V20 h-18 z" fill={right} />
          <ellipse cx="32" cy="20" rx="18" ry="8" fill={top} />
        </g>
      );

    case "cone":
      return (
        <g>
          <path d="M32 10 L14 44 a18 8 0 0 0 36 0 z" fill={left} />
          <path d="M32 10 L50 44 a18 8 0 0 1 -18 8 z" fill={right} />
          <ellipse cx="32" cy="44" rx="18" ry="8" fill={top} fillOpacity="0.35" />
        </g>
      );

    case "octahedron":
      return (
        <g>
          <polygon points="32,8 14,32 32,32" fill={top} />
          <polygon points="32,8 50,32 32,32" fill={left} />
          <polygon points="14,32 32,32 32,56" fill={right} />
          <polygon points="50,32 32,32 32,56" fill={left} fillOpacity="0.75" />
          <line x1="14" y1="32" x2="50" y2="32" stroke={line} strokeOpacity="0.35" strokeWidth="1" />
        </g>
      );

    case "stack":
      return (
        <g>
          <polygon points="32,34 50,44 32,54 14,44" fill={right} />
          <polygon points="32,24 50,34 32,44 14,34" fill={left} />
          <polygon points="32,12 50,22 32,32 14,22" fill={top} />
        </g>
      );
  }
}
