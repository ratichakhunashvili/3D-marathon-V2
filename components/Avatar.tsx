import { decodePreset, INK, type Animal, type Palette } from "@/lib/avatars";

type AvatarSource = {
  name: string;
  avatar_type: "preset" | "upload";
  avatar_value: string;
};

/**
 * Draws a team icon. Preset icons are pure SVG built from the id (no files, no
 * requests); an uploaded icon is streamed from Drive through /api/avatar.
 *
 * Gradient ids are derived from the preset id, so the same icon twice on a page
 * emits an identical <defs> twice — harmless, and it keeps this a plain server
 * component.
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
  const { animal, palette, index } = decodePreset(id);
  const gid = `av-${id.replace(/[^a-z0-9-]/gi, "")}`;

  // A negative delay starts each icon mid-cycle, so a grid of them never bobs
  // in lockstep. Six offsets is enough to break up any row.
  const stagger = { animationDelay: `${-0.37 * (index % 6)}s` };

  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-hidden="true">
      <defs>
        <linearGradient id={`${gid}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.bg} />
          <stop offset="100%" stopColor={palette.bgTo} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" fill={`url(#${gid}-bg)`} />
      <g className="av-bob" style={stagger}>
        <AnimalArt animal={animal} palette={palette} />
      </g>
    </svg>
  );
}

/**
 * One <g> per animal. Everything is drawn with a heavy shared keyline so the
 * icons read at 20px in a comment thread, and each animal owns exactly one
 * moving part on top of the shared bob — enough to feel alive, cheap enough
 * that a page full of avatars costs nothing.
 */
function AnimalArt({ animal, palette }: { animal: Animal; palette: Palette }) {
  const { body, shade, light } = palette;
  const line = { stroke: INK, strokeWidth: 2.4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const thin = { stroke: INK, strokeWidth: 1.8, strokeLinecap: "round" as const, fill: "none" };

  switch (animal) {
    case "gecko":
      return (
        <g>
          {/* Front-facing, like the rest of the set: broad crown tapering to a
              snout, with the vertical slit pupils that read as "lizard". */}
          <path
            d="M32 13c11 0 18 7 18 15 0 6-2 11-6 15-3 4-7 8-12 8s-9-4-12-8c-4-4-6-9-6-15 0-8 7-15 18-15z"
            fill={body}
            {...line}
          />
          <path d="M32 34c5 0 8 3 8 7 0 4-4 8-8 8s-8-4-8-8c0-4 3-7 8-7z" fill={light} opacity="0.5" />
          <g className="av-blink">
            <circle cx="23" cy="27" r="6.2" fill="#fff" {...line} strokeWidth="2" />
            <circle cx="41" cy="27" r="6.2" fill="#fff" {...line} strokeWidth="2" />
            <ellipse cx="23" cy="27" rx="1.5" ry="4" fill={INK} />
            <ellipse cx="41" cy="27" rx="1.5" ry="4" fill={INK} />
          </g>
          <circle cx="32" cy="19" r="1.6" fill={shade} />
          <circle cx="26" cy="16.5" r="1.3" fill={shade} />
          <circle cx="38" cy="16.5" r="1.3" fill={shade} />
          <path d="M26 39c3.5 2.5 8.5 2.5 12 0" {...thin} strokeWidth="2.2" />
          <path className="av-tongue" d="M32 41v7" {...thin} strokeWidth="2.4" stroke="#e8607a" />
        </g>
      );

    case "bee":
      return (
        <g>
          <ellipse className="av-wing-l" cx="24" cy="24" rx="9" ry="6" fill="#fff" opacity="0.9" {...line} strokeWidth="2" />
          <ellipse className="av-wing-r" cx="42" cy="24" rx="9" ry="6" fill="#fff" opacity="0.9" {...line} strokeWidth="2" />
          <path d="M33 15v-4" {...thin} />
          <circle cx="33" cy="9" r="2" fill={INK} />
          <ellipse cx="32" cy="40" rx="15" ry="13" fill={body} {...line} />
          {/* stripes, clipped to the body by their own arc shape */}
          <path d="M23.5 31.5c5 3 10 3 17 0" fill="none" stroke={shade} strokeWidth="4.2" strokeLinecap="round" />
          <path d="M18.5 40h27" fill="none" stroke={shade} strokeWidth="4.6" strokeLinecap="round" />
          <path d="M21 48.5c4.5 2.5 14 2.5 22 0" fill="none" stroke={shade} strokeWidth="4" strokeLinecap="round" />
          <circle className="av-blink" cx="26" cy="36" r="2.4" fill={INK} />
          <circle className="av-blink" cx="38" cy="36" r="2.4" fill={INK} />
        </g>
      );

    case "cat":
      return (
        <g>
          <path className="av-ear" d="M17 26 15 11l13 7z" fill={body} {...line} />
          <path className="av-ear-r" d="M47 26 49 11l-13 7z" fill={body} {...line} />
          <path d="M18.5 22.5 17.5 15l6.5 3.5z" fill={shade} />
          <path d="M45.5 22.5 46.5 15 40 18.5z" fill={shade} />
          <ellipse cx="32" cy="35" rx="17" ry="15" fill={body} {...line} />
          <ellipse cx="32" cy="41" rx="9" ry="7" fill={light} opacity="0.6" />
          <g className="av-blink">
            <ellipse cx="25" cy="32" rx="2.6" ry="3.2" fill={INK} />
            <ellipse cx="39" cy="32" rx="2.6" ry="3.2" fill={INK} />
          </g>
          <path d="M32 38.5 30 41h4z" fill={INK} />
          <path d="M32 42.5c-2 2-4 1.5-4.5 0M32 42.5c2 2 4 1.5 4.5 0" {...thin} />
          <path d="M12 33h6M12 38h6M46 33h6M46 38h6" {...thin} strokeWidth="1.5" opacity="0.75" />
        </g>
      );

    case "fox":
      return (
        <g>
          <path className="av-ear" d="M14 27 12 8l16 10z" fill={body} {...line} />
          <path className="av-ear-r" d="M50 27 52 8 36 18z" fill={body} {...line} />
          <path d="M16 23 15 13l8 5z" fill={shade} />
          <path d="M48 23 49 13l-8 5z" fill={shade} />
          <path d="M32 18c10 0 17 7 17 15 0 9-8 15-17 15s-17-6-17-15c0-8 7-15 17-15z" fill={body} {...line} />
          {/* white ruff and muzzle, the fox's giveaway */}
          <path d="M32 33c5 0 9 4 9 8 0 4-4 7-9 7s-9-3-9-7c0-4 4-8 9-8z" fill={light} {...line} strokeWidth="2" />
          <g className="av-blink">
            <ellipse cx="24" cy="30" rx="2.6" ry="3" fill={INK} />
            <ellipse cx="40" cy="30" rx="2.6" ry="3" fill={INK} />
          </g>
          <ellipse cx="32" cy="41" rx="3" ry="2.4" fill={INK} />
        </g>
      );

    case "frog":
      return (
        <g>
          <ellipse cx="32" cy="41" rx="19" ry="14" fill={body} {...line} />
          <ellipse cx="32" cy="46" rx="11" ry="6" fill={light} opacity="0.55" />
          {/* eyes ride on top of the head, which is what makes it a frog */}
          <circle cx="21" cy="26" r="7.5" fill={body} {...line} />
          <circle cx="43" cy="26" r="7.5" fill={body} {...line} />
          <g className="av-blink">
            <circle cx="21" cy="26" r="4.4" fill="#fff" {...line} strokeWidth="2" />
            <circle cx="43" cy="26" r="4.4" fill="#fff" {...line} strokeWidth="2" />
            <circle cx="21.5" cy="26" r="2" fill={INK} />
            <circle cx="42.5" cy="26" r="2" fill={INK} />
          </g>
          <path d="M20 41c4 5 20 5 24 0" {...thin} strokeWidth="2.2" />
          <circle cx="25" cy="36" r="1.4" fill={shade} />
          <circle cx="39" cy="36" r="1.4" fill={shade} />
        </g>
      );

    case "owl":
      return (
        <g>
          <path d="M20 20l3-9 7 6zM44 20l-3-9-7 6z" fill={shade} {...line} strokeWidth="2" />
          <path d="M32 14c10 0 17 8 17 19s-7 19-17 19-17-8-17-19 7-19 17-19z" fill={body} {...line} />
          <path d="M32 33c5 0 9 5 9 11s-4 9-9 9-9-3-9-9 4-11 9-11z" fill={light} opacity="0.5" />
          <g className="av-blink">
            <circle cx="24" cy="29" r="7" fill="#fff" {...line} strokeWidth="2" />
            <circle cx="40" cy="29" r="7" fill="#fff" {...line} strokeWidth="2" />
            <circle cx="24" cy="29" r="3" fill={INK} />
            <circle cx="40" cy="29" r="3" fill={INK} />
          </g>
          <path d="M32 34l-3.5 5h7z" fill={shade} {...line} strokeWidth="1.8" />
          <path d="M23 46c3 2 5 3 9 3s6-1 9-3" {...thin} />
        </g>
      );

    case "chick":
      return (
        <g>
          <path d="M32 12v-4M27 13l-2-4M37 13l2-4" {...thin} strokeWidth="2.2" />
          <ellipse cx="32" cy="38" rx="16" ry="15" fill={body} {...line} />
          <ellipse cx="32" cy="43" rx="9" ry="8" fill={light} opacity="0.55" />
          <path d="M17 38c-3 2-3 6 0 8" fill={body} {...line} strokeWidth="2" />
          <g className="av-blink">
            <circle cx="26" cy="34" r="2.5" fill={INK} />
            <circle cx="38" cy="34" r="2.5" fill={INK} />
          </g>
          <path className="av-beak" d="M32 38l-4.5 4 4.5 3.5 4.5-3.5z" fill={shade} {...line} strokeWidth="2" />
          <path d="M26 52l-2 4M38 52l2 4" {...thin} strokeWidth="2.2" />
        </g>
      );

    case "turtle":
      return (
        <g>
          {/* Feet first, then the shell, then the head on top — drawing the
              head last is what keeps it in front of the shell's edge. */}
          <ellipse cx="18" cy="45" rx="5" ry="3.4" fill={shade} {...line} strokeWidth="2" />
          <ellipse cx="38" cy="45" rx="5" ry="3.4" fill={shade} {...line} strokeWidth="2" />
          <path d="M28 20c11 0 18 7 18 15 0 6-8 9-18 9s-18-3-18-9c0-8 7-15 18-15z" fill={body} {...line} />
          <path d="M28 20c-4 0-7 5-7 11 0 4 3 6 7 6s7-2 7-6c0-6-3-11-7-11z" fill={shade} {...line} strokeWidth="2" />
          <path d="M10.5 33c3 2 5 3 10 3.5M45.5 33c-3 2-5 3-10 3.5" {...thin} strokeWidth="2" />
          <g className="av-poke">
            <circle cx="51" cy="36" r="7.4" fill={body} {...line} />
            <circle cx="54" cy="34" r="1.9" fill={INK} />
            <path d="M53.5 39.5c1.5.8 3 .3 3.8-.8" {...thin} strokeWidth="1.7" />
          </g>
        </g>
      );
  }
}
