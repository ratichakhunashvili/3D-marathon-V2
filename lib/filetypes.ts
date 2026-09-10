export type FileKind = "model" | "texture" | "screenshot" | "other";

/** Formats three.js can actually draw in the browser -> the loader used by components/ModelViewer.tsx */
export const VIEWABLE: Record<string, string> = {
  glb: "gltf",
  gltf: "gltf",
  obj: "obj",
  stl: "stl",
  ply: "ply",
  fbx: "fbx",
  "3mf": "3mf",
  dae: "collada",
  "3ds": "3ds",
  wrl: "vrml",
  vrml: "vrml",
};

/** Source/interchange files we accept but cannot draw — shown as a download card. */
const MODEL_ONLY = new Set([
  // DCC project files
  "blend", "blend1", "max", "ma", "mb", "c4d", "lxo", "lwo", "lws", "hip", "hiplc",
  "ztl", "zpr", "zbr", "spp", "sbs", "sbsar", "sbsprs", "mud", "mra", "3dm",
  // CAD / engineering
  "step", "stp", "iges", "igs", "sldprt", "sldasm", "ipt", "iam", "f3d", "f3z",
  "catpart", "prt", "x_t", "x_b", "dwg", "dxf", "skp",
  // interchange / caches
  "abc", "usd", "usda", "usdc", "usdz", "x3d", "gltf2", "bvh", "vox", "mtl", "amf", "off", "gcode",
]);

const TEXTURE = new Set([
  "png", "jpg", "jpeg", "webp", "avif", "gif", "bmp", "tif", "tiff",
  "tga", "exr", "hdr", "psd", "kra", "xcf", "dds", "ktx", "ktx2", "basis",
]);

/** Textures that a browser can display directly, so they can double as screenshots/covers. */
export const DISPLAYABLE_IMAGE = new Set(["png", "jpg", "jpeg", "webp", "avif", "gif", "bmp"]);

const OTHER = new Set([
  "zip", "rar", "7z", "tar", "gz", "pdf", "txt", "md", "json", "csv",
  "mp4", "mov", "webm", "mkv", "gifv", "wav", "mp3",
]);

const MIME: Record<string, string> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  obj: "text/plain",
  stl: "model/stl",
  ply: "application/octet-stream",
  fbx: "application/octet-stream",
  "3mf": "model/3mf",
  dae: "model/vnd.collada+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  pdf: "application/pdf",
  zip: "application/zip",
  txt: "text/plain",
  json: "application/json",
};

export function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 1 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

export function isAllowed(filename: string): boolean {
  const ext = extOf(filename);
  if (!ext) return false;
  return ext in VIEWABLE || MODEL_ONLY.has(ext) || TEXTURE.has(ext) || OTHER.has(ext);
}

export function isViewable(filename: string): boolean {
  return extOf(filename) in VIEWABLE;
}

export function loaderFor(filename: string): string | null {
  return VIEWABLE[extOf(filename)] ?? null;
}

export function mimeFor(filename: string): string {
  return MIME[extOf(filename)] ?? "application/octet-stream";
}

/** Where a file belongs in the version listing. `declared` lets the upload form force
 *  "this PNG is a screenshot" instead of "this PNG is a texture". */
export function kindOf(filename: string, declared?: FileKind): FileKind {
  const ext = extOf(filename);
  if (declared === "screenshot" && DISPLAYABLE_IMAGE.has(ext)) return "screenshot";
  if (ext in VIEWABLE || MODEL_ONLY.has(ext)) return "model";
  if (TEXTURE.has(ext)) return "texture";
  return "other";
}

/** Human list for the upload form's help text and the `accept` attribute. */
export const ALLOWED_EXT_LIST: string[] = [
  ...Object.keys(VIEWABLE),
  ...[...MODEL_ONLY].sort(),
  ...[...TEXTURE].sort(),
  ...[...OTHER].sort(),
];

export const ACCEPT_ATTR = ALLOWED_EXT_LIST.map((e) => `.${e}`).join(",");
