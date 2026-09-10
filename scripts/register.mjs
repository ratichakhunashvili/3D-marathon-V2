// Installs the extension-resolving hooks, then Node runs the .ts entry point directly
// using its built-in type stripping — no compiler, no extra dependency.
import { register } from "node:module";

register("./ts-hooks.mjs", import.meta.url);
