import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { PwaManager } from "@/components/pwa-manager";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brunovia — Built for better business",
  description: "Built for better business",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/brunovia-logo.png", type: "image/png" }] },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Brunovia",
  },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = {
  themeColor: "#12845b",
  width: "device-width",
  initialScale: 1,
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <main>{children}</main>
          <Toaster richColors position="top-right" />
          <PwaManager />
        </ThemeProvider>
      </body>
    </html>
  );
}
