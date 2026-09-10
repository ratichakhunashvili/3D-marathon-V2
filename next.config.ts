import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a minimal server.js and a pruned node_modules,
  // which is what the Cloud Run image runs. server.js honours PORT and
  // HOSTNAME, so it drops straight into Cloud Run's contract.
  // See docs/DEPLOY-FIREBASE.md.
  output: "standalone",
};

export default nextConfig;
