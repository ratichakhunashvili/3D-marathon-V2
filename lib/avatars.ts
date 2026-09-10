// The preset avatar catalog: 8 animals x 6 yellow colourways = 48 animated icons.
// Nothing is fetched or stored — an id like "geo-27" is enough to draw the icon,
// so a team's choice costs one short string in the database.
//
// The ids keep their historical "geo-" prefix on purpose. Every existing account
// already stores one, the accounts table defaults to 'geo-01', and the ids are
// opaque keys rather than anything a user sees — so swapping the artwork from
// geometric solids to animals needs no migration and breaks no avatar.

export type Palette = {
  /** background gradient */
  bg: string;
  bgTo: string;
  /** main body fill */
  body: string;
  /** darker body areas: inner ears, shell segments, stripes, wing shade */
  shade: string;
  /** bellies, cheeks and highlights */
  light: string;
};

/** Every colourway sits in the logo's yellow family, ordered pale -> deep so
 *  the same animal stays tellable apart across palettes. */
export const PALETTES: Palette[] = [
  { bg: "#fffada", bgTo: "#ffe97a", body: "#ffd914", shade: "#d99e00", light: "#fff8d4" },
  { bg: "#fff3bd", bgTo: "#ffd447", body: "#f5bd0d", shade: "#bd7f00", light: "#fff0b6" },
  { bg: "#ffeaad", bgTo: "#ffc21f", body: "#e79a08", shade: "#9e5e00", light: "#ffe49b" },
  { bg: "#fdf2cf", bgTo: "#f0c34d", body: "#d9a520", shade: "#8f6408", light: "#fbebb8" },
  { bg: "#f6f2c6", bgTo: "#ddd455", body: "#bcb61e", shade: "#6f6b0f", light: "#f0edb4" },
  { bg: "#fffef4", bgTo: "#ffeeb0", body: "#ffe98a", shade: "#d4ac35", light: "#fffce6" },
];

/** The outline colour, shared by every icon — this is the logo's cartoon keyline. */
export const INK = "#17150d";

export const ANIMALS = [
  "gecko", // nods to the site's own mascot
  "bee",
  "cat",
  "fox",
  "frog",
  "owl",
  "chick",
  "turtle",
] as const;

export type Animal = (typeof ANIMALS)[number];

export const PRESET_COUNT = ANIMALS.length * PALETTES.length; // 48

export const PRESET_IDS: string[] = Array.from(
  { length: PRESET_COUNT },
  (_, i) => `geo-${String(i + 1).padStart(2, "0")}`,
);

export const DEFAULT_PRESET = PRESET_IDS[0];

/** Maps "geo-27" to the animal + palette it draws. Unknown ids fall back to the first icon. */
export function decodePreset(id: string): { animal: Animal; palette: Palette; index: number } {
  const match = /^geo-(\d{1,2})$/.exec(id ?? "");
  const n = match ? Number(match[1]) : 1;
  const index = n >= 1 && n <= PRESET_COUNT ? n - 1 : 0;
  return {
    animal: ANIMALS[index % ANIMALS.length],
    palette: PALETTES[Math.floor(index / ANIMALS.length) % PALETTES.length],
    index,
  };
}

/** Deterministic icon for a name — used as the default when a team is created. */
export function presetForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 100000;
  return PRESET_IDS[hash % PRESET_COUNT];
}
