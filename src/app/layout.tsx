import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Rubik, Playfair_Display } from "next/font/google";
import { AuthProvider } from "@/providers/AuthProvider";
import { I18nProvider } from "@/components/providers/I18nProvider";
import { Toaster } from "@/components/ui/sonner";
import { GlobalToolbar } from "@/components/GlobalToolbar";
import { GameToolbarProvider } from "@/contexts/GameToolbarContext";
import GlobalErrorBoundary from "@/components/GlobalErrorBoundary";
import PageViewLogger from "@/components/PageViewLogger";
import "../assets/scss/main.scss";
import "./globals.css";
// AOS CSS + initializer used to live here. Only the home page actually
// uses `[data-aos]` elements, so both moved to src/app/page.tsx to keep
// the cost off every other route.

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

const SITE_URL = 'https://meetyudai.com';
const SITE_NAME = 'Yudai Yaguchi';
const SITE_TITLE = 'Yudai Yaguchi — Senior Fintech Engineer';
const SITE_DESCRIPTION =
  'Senior software engineer with 6+ years building large-scale fintech systems — payments, KYC compliance, and customer-support infrastructure at Atlas and PayPal.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: '%s | Yudai Yaguchi',
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'Yudai Yaguchi',
    'Senior Software Engineer',
    'Fintech Engineer',
    'Payments',
    'KYC',
    'Next.js',
    'TypeScript',
    'San Francisco',
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  alternates: {
    canonical: '/',
    languages: {
      'en-US': '/',
      'ja-JP': '/',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['ja_JP'],
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: '/favicon.ico',
  },
};

const personJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: SITE_NAME,
  alternateName: '矢口 雄大',
  url: SITE_URL,
  jobTitle: 'Senior Software Engineer',
  worksFor: {
    '@type': 'Organization',
    name: 'Atlas',
  },
  sameAs: [
    'https://www.linkedin.com/in/yudai-yaguchi/',
    'https://github.com/gomyway1216',
  ],
  description: SITE_DESCRIPTION,
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
        />
      </head>
      <body className={`${rubik.variable} ${playfair.variable}`} suppressHydrationWarning>
        <Toaster />
        <GlobalErrorBoundary />
        <Suspense fallback={null}>
          <PageViewLogger />
        </Suspense>
        <I18nProvider>
          <AuthProvider>
            <GameToolbarProvider>
              <GlobalToolbar />
              {children}
            </GameToolbarProvider>
          </AuthProvider>
        </I18nProvider>
        <div id="modal-root"></div>
      </body>
    </html>
  );
}
