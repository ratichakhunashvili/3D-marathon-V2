// Team and model names may be written in Georgian, so slugs are transliterated
// rather than stripped — otherwise "ჩემი სკამი" would slug to an empty string.
const KA_TO_LATIN: Record<string, string> = {
  ა: "a", ბ: "b", გ: "g", დ: "d", ე: "e", ვ: "v", ზ: "z", თ: "t", ი: "i",
  კ: "k", ლ: "l", მ: "m", ნ: "n", ო: "o", პ: "p", ჟ: "zh", რ: "r", ს: "s",
  ტ: "t", უ: "u", ფ: "f", ქ: "q", ღ: "gh", ყ: "y", შ: "sh", ჩ: "ch",
  ც: "ts", ძ: "dz", წ: "w", ჭ: "tch", ხ: "kh", ჯ: "j", ჰ: "h",
};

export function slugify(input: string, fallback = "item"): string {
  const transliterated = Array.from(input.trim().toLowerCase())
    .map((ch) => KA_TO_LATIN[ch] ?? ch)
    .join("");

  const slug = transliterated
    .normalize("NFKD")
    .replace(new RegExp("[\u0300-\u036f]", "g"), "") // drop accents left over from NFKD
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

  return slug || fallback;
}

/** Appends -2, -3 … until the slug is free. `taken` is the set of slugs already in use. */
export function uniqueSlug(base: string, taken: Iterable<string>, fallback = "item"): string {
  const used = new Set(taken);
  const root = slugify(base, fallback);
  if (!used.has(root)) return root;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${root}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}
