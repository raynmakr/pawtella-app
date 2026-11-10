import type { Metadata, Viewport } from "next";
import { Inter, Nunito } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], display: "swap", weight: ["600", "700", "800", "900"] });

export const metadata: Metadata = {
  title: { default: "Pawtella", template: "%s · Pawtella" },
  description: "Your pet's favourite app. AI videos of your pet, answers about their health and habits, and supplies with pickup in Toronto or delivery.",
  applicationName: "Pawtella",
  metadataBase: process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL) : undefined,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFF8F1" },
    { media: "(prefers-color-scheme: dark)", color: "#15120F" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Resize the layout (and dvh) when the on-screen keyboard opens, so pinned
  // inputs stay above it instead of being overlaid. Honoured on Chrome Android;
  // iOS Safari is handled via visualViewport in KeyboardListener.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${nunito.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
