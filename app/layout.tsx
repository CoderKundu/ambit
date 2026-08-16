import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ambit — music that fits what you're doing",
  description:
    "A situation-based music recommender. Pick a moment, get a queue, and see the reason behind every pick — computed from acoustic features extracted from the audio itself.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
