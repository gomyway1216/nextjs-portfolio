import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { cookies, headers } from "next/headers";
import { Rubik, Playfair_Display } from "next/font/google";
import { AuthProvider } from "@/providers/AuthProvider";
import { I18nProvider } from "@/components/providers/I18nProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { GlobalToolbar } from "@/components/GlobalToolbar";
import { RouteScrollBehaviorFix } from "@/components/RouteScrollBehaviorFix";
import { GameToolbarProvider } from "@/contexts/GameToolbarContext";
import GlobalErrorBoundary from "@/components/GlobalErrorBoundary";
import PageViewLogger from "@/components/PageViewLogger";
import { SITE_URL } from "@/lib/siteConfig";
import { DEFAULT_SOCIAL_LINKS } from "@/lib/socialLinks";
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

const SITE_NAME = 'Yudai Yaguchi';
const SITE_TITLE = 'Yudai Yaguchi — Senior Fintech Engineer';
const SITE_DESCRIPTION =
  'Senior software engineer with 6+ years building fintech systems across payments, risk/compliance, product growth, and operations tooling.';

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
    'Risk',
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
};

// Stable @id values so the Person and Organization nodes can cross-
// reference each other (founder <-> memberOf) instead of duplicating data.
// Both ids put the fragment on the canonical root URL (trailing slash
// before '#') so the Person<->Organization cross-references resolve
// consistently across JSON-LD/RDF parsers.
const PERSON_ID = `${SITE_URL}/#person`;
const COMMUNITY_ID = 'https://bayarea-ai.com/#organization';

const personJsonLd = {
  '@type': 'Person',
  '@id': PERSON_ID,
  name: SITE_NAME,
  alternateName: '矢口 雄大',
  url: SITE_URL,
  jobTitle: 'Senior Software Engineer',
  worksFor: {
    '@type': 'Organization',
    name: 'Atlas',
  },
  // Community leadership: ties the Person to the AI community he runs.
  // The founder relationship lives on the Organization node below.
  memberOf: { '@id': COMMUNITY_ID },
  // Static fallback links on purpose: the layout renders without a
  // profile fetch. Kept in sync via the shared DEFAULT_SOCIAL_LINKS.
  sameAs: DEFAULT_SOCIAL_LINKS.map((link) => link.url),
  description: SITE_DESCRIPTION,
};

// Separate node so the founder relationship is explicit and crawlable:
// search engines can connect "Yudai Yaguchi" to the Bay Area AI Study
// Group he founded and organizes.
const communityJsonLd = {
  '@type': 'Organization',
  '@id': COMMUNITY_ID,
  name: 'Bay Area AI Study Group',
  url: 'https://bayarea-ai.com',
  description:
    'A Bay Area community for AI engineers, hosting monthly meetups and a platform for sharing projects, articles, and Q&A.',
  founder: { '@id': PERSON_ID },
};

// One @graph keeps both entities (and their cross-references) in a single
// script tag.
const structuredDataJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [personJsonLd, communityJsonLd],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the i18nextLng cookie server-side and forward to I18nProvider so
  // SSR uses the same locale as the client's first render. Without this,
  // JA visitors get "Senior Fintech Engineer" in the SSR HTML and
  // "シニアフィンテックエンジニア" after hydration — React #418.
  const cookieStore = await cookies();
  const cookieLang = cookieStore.get('i18nextLng')?.value;
  const hdrs = await headers();
  const acceptLanguage = hdrs.get('accept-language') ?? '';
  const preferredLanguage = acceptLanguage.split(',')[0]?.trim().toLowerCase();
  const initialLang: 'en' | 'ja' =
    cookieLang === 'ja' || (!cookieLang && preferredLanguage?.startsWith('ja')) ? 'ja' : 'en';

  return (
    <html lang={initialLang} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredDataJsonLd) }}
        />
      </head>
      <body className={`${rubik.variable} ${playfair.variable}`} suppressHydrationWarning>
        <ThemeProvider>
          <RouteScrollBehaviorFix />
          <Toaster />
          <GlobalErrorBoundary />
          <Suspense fallback={null}>
            <PageViewLogger />
          </Suspense>
          <I18nProvider initialLang={initialLang}>
            <AuthProvider>
              <GameToolbarProvider>
                <GlobalToolbar />
                {children}
              </GameToolbarProvider>
            </AuthProvider>
          </I18nProvider>
          <div id="modal-root"></div>
        </ThemeProvider>
      </body>
    </html>
  );
}
