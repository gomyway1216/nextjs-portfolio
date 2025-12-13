import type { Metadata, Viewport } from "next";
import { Rubik, Playfair_Display } from "next/font/google";
import { AuthProvider } from "@/providers/AuthProvider";
import { PostsProvider } from "@/providers/PostsProvider";
import AOSInitializer from "./AOSInitializer";
import { Toaster } from "@/components/ui/sonner";
import "../assets/scss/main.scss";
import "aos/dist/aos.css";

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
        <AuthProvider>
          <PostsProvider>
            {children}
          </PostsProvider>
        </AuthProvider>
        <div id="modal-root"></div>
      </body>
    </html>
  );
}
