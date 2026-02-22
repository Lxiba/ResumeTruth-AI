import type { NextConfig } from "next"
import path from "path"

const nextConfig: NextConfig = {
  // Keep these packages out of the browser/edge bundle — Node.js only
  serverExternalPackages: [
    "pdf-parse",
    "mammoth",
    "pdfjs-dist",
    "tesseract.js",
  ],
  webpack: (config: any, { isServer }: { isServer: boolean }) => {
    if (isServer) {
      // canvas is in optionalDependencies and is not available on Vercel.
      // Aliasing to false prevents webpack from attempting to bundle it,
      // which would otherwise cause a build error even with try/catch imports.
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
