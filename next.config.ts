import type { NextConfig } from "next"
import path from "path"

const nextConfig: NextConfig = {
  // Keep these packages out of the browser/edge bundle — Node.js only.
  // "pdfjs-dist" covers both the main entry and any subpath imports
  // (e.g. pdfjs-dist/legacy/build/pdf.mjs) from that package.
  serverExternalPackages: [
    "mammoth",
    "pdfjs-dist",
    "tesseract.js",
  ],
  webpack: (config: any, { isServer }: { isServer: boolean }) => {
    if (isServer) {
      // canvas is in optionalDependencies and may not be available in all
      // deployment environments. Aliasing to false prevents webpack from
      // attempting to bundle it, which would otherwise cause a build error.
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      }
    }
    return config
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
}

export default nextConfig
