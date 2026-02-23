import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  title: "ResumeTruth AI",
  description:
    "Analyze your resume against any job description. Get a hiring probability score, missing skills, and an AI-optimized resume in seconds.",
  keywords: ["resume optimizer", "AI resume", "job application", "ATS", "career"],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} min-h-screen overflow-x-hidden bg-[#0B1F3A] font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
