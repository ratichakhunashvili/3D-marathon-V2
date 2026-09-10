// Node's ESM resolver requires file extensions; the app's own imports omit them because
// the Next.js bundler fills them in. These hooks do the same for `node scripts/*.ts`,
// so the scripts can import lib/ directly instead of duplicating queries.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

export async function resolve(specifier, context, next) {
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExtension = /\.[a-z0-9]+$/i.test(specifier);

  if (relative && !hasExtension && context.parentURL) {
    const base = new URL(specifier, context.parentURL);
    for (const ext of EXTENSIONS) {
      if (existsSync(fileURLToPath(new URL(base.href + ext)))) {
        return next(specifier + ext, context);
      }
    }
  }

  return next(specifier, context);
}
