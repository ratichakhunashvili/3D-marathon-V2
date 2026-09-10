import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Nothing to configure: Vercel builds and serves this directly.
   *
   * `output: "standalone"` used to be set here for the Cloud Run image in
   * Dockerfile. If you ever go back to self-hosting a container, put it back —
   * that Dockerfile depends on .next/standalone existing. See
   * docs/DEPLOY-FIREBASE.md. */
};

export default nextConfig;
