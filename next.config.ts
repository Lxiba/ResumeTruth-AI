import type { NextConfig } from "next"
import path from "path"

const nextConfig: NextConfig = {
  // Keep these packages out of the browser/edge bundle — Node.js only
  serverExternalPackages: [
    "pdf-parse",
    "mammoth",
    "canvas",
    "pdfjs-dist",
    "tesseract.js",
  ],
  turbopack: {
    root: path.resolve(__dirname),
  },
}

export default nextConfig
