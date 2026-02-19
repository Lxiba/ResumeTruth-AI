import type { NextConfig } from "next"
import path from "path"

const nextConfig: NextConfig = {
  // pdf-parse uses Node.js built-ins; exclude from edge/browser bundles
  serverExternalPackages: ["pdf-parse", "mammoth"],
  turbopack: {
    root: path.resolve(__dirname),
  },
}

export default nextConfig
