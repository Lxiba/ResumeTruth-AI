import type { NextConfig } from "next"
import path from "path"

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "mammoth",
    "pdfjs-dist",
    "tesseract.js",
  ],
  webpack: (config: any, { isServer }: { isServer: boolean }) => {
    if (isServer) {
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
