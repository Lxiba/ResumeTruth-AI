import type { NextConfig } from "next"
import path from "path"

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "mammoth",
    "pdfjs-dist",
    "tesseract.js",
  ],
  // The pdfjs worker is loaded via a file:// URL (not via import), so Vercel's
  // file tracer won't pick it up automatically. Force-include it so it exists
  // at process.cwd()/node_modules/... when the serverless function runs.
  experimental: {
    // outputFileTracingIncludes is valid at runtime; types lag behind in some Next.js releases
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    outputFileTracingIncludes: {
      "/api/parse-resume": [
        "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      ],
    },
  },
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
