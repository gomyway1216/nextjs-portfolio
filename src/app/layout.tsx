import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Rubik, Playfair_Display } from "next/font/google";
import { AuthProvider } from "@/providers/AuthProvider";
import { PostsProvider } from "@/providers/PostsProvider";
import { I18nProvider } from "@/components/providers/I18nProvider";
import AOSInitializer from "./AOSInitializer";
import { Toaster } from "@/components/ui/sonner";
import { GlobalToolbar } from "@/components/GlobalToolbar";
import { GameToolbarProvider } from "@/contexts/GameToolbarContext";
import GlobalErrorBoundary from "@/components/GlobalErrorBoundary";
import PageViewLogger from "@/components/PageViewLogger";
import "../assets/scss/main.scss";
import "aos/dist/aos.css";
import "./globals.css";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
};

const rubik = Rubik({
  weight: ['300', '400', '500', '700', '900'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-rubik',
  display: 'swap',
});

const playfair = Playfair_Display({
  weight: ['400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Yudai Portfolio",
  description: "Portfolio website for Yudai Yaguchi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" />
      </head>
      <body className={`${rubik.variable} ${playfair.variable}`} suppressHydrationWarning>
        <AOSInitializer />
        <Toaster />
        <GlobalErrorBoundary />
        <Suspense fallback={null}>
          <PageViewLogger />
        </Suspense>
        <I18nProvider>
          <AuthProvider>
            <PostsProvider>
              <GameToolbarProvider>
                <GlobalToolbar />
                {children}
              </GameToolbarProvider>
            </PostsProvider>
          </AuthProvider>
        </I18nProvider>
        <div id="modal-root"></div>
      </body>
    </html>
  );
}
