import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SystemFavicon } from "@/components/system-favicon";
import { BannerProvider, GlobalBanner } from "@geiger/ui/global-banner";
import { Toaster } from "@geiger/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Docs - Geiger Studio",
  description: "Write, organize and share your team's documents.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SystemFavicon />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <BannerProvider>
            <div className="flex flex-col min-h-screen">
              <GlobalBanner />
              {children}
            </div>
            <Toaster richColors />
          </BannerProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
