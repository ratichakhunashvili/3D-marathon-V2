// The preset avatar catalog: 8 solid shapes x 6 colourways = 48 generated icons.
// Nothing is fetched or stored — an id like "geo-27" is enough to draw the icon,
// so a team's choice costs one short string in the database.

export type Palette = {
  bgFrom: string;
  bgTo: string;
  top: string;
  left: string;
  right: string;
  line: string;
};

export const PALETTES: Palette[] = [
  { bgFrom: "#1e1b4b", bgTo: "#4338ca", top: "#c7d2fe", left: "#6366f1", right: "#4338ca", line: "#eef2ff" },
  { bgFrom: "#083344", bgTo: "#0e7490", top: "#a5f3fc", left: "#22d3ee", right: "#0e7490", line: "#ecfeff" },
  { bgFrom: "#3b0764", bgTo: "#a21caf", top: "#f5d0fe", left: "#d946ef", right: "#a21caf", line: "#fdf4ff" },
  { bgFrom: "#422006", bgTo: "#b45309", top: "#fde68a", left: "#f59e0b", right: "#b45309", line: "#fffbeb" },
  { bgFrom: "#052e16", bgTo: "#15803d", top: "#bbf7d0", left: "#22c55e", right: "#15803d", line: "#f0fdf4" },
  { bgFrom: "#450a0a", bgTo: "#be123c", top: "#fecdd3", left: "#f43f5e", right: "#be123c", line: "#fff1f2" },
];

export const SHAPES = [
  "cube",
  "pyramid",
  "sphere",
  "torus",
  "cylinder",
  "cone",
  "octahedron",
  "stack",
] as const;

export type Shape = (typeof SHAPES)[number];

export const PRESET_COUNT = SHAPES.length * PALETTES.length; // 48

export const PRESET_IDS: string[] = Array.from(
  { length: PRESET_COUNT },
  (_, i) => `geo-${String(i + 1).padStart(2, "0")}`,
);

export const DEFAULT_PRESET = PRESET_IDS[0];

/** Maps "geo-27" to the shape + palette it draws. Unknown ids fall back to the first icon. */
export function decodePreset(id: string): { shape: Shape; palette: Palette } {
  const match = /^geo-(\d{1,2})$/.exec(id ?? "");
  const n = match ? Number(match[1]) : 1;
  const index = n >= 1 && n <= PRESET_COUNT ? n - 1 : 0;
  return {
    shape: SHAPES[index % SHAPES.length],
    palette: PALETTES[Math.floor(index / SHAPES.length) % PALETTES.length],
  };
}

/** Deterministic icon for a name — used as the default when a team is created. */
export function presetForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 100000;
  return PRESET_IDS[hash % PRESET_COUNT];
}
