import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import packageJson from "./package.json";

function readGitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  // Build metadata exposed to the browser. Used by the client-side activity
  // log helper and the Cloud Function fetch wrapper to attach
  // x-app-version / x-app-build-sha headers, which the backend stores on
  // every activity_logs row for deploy correlation.
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_APP_BUILD_SHA: readGitSha(),
  },

  // Disable React StrictMode to suppress warnings from third-party packages
  reactStrictMode: false,

  // Enable SCSS support
  sassOptions: {
    includePaths: ['./src/assets/scss'],
    silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin', 'color-functions'],
    quietDeps: true,
  },

  // Image optimization configuration
  images: {
    qualities: [75, 95],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'cdn.myanimelist.net',
      },
    ],
  },

  // Webpack configuration to suppress source map warnings
  webpack: (config, { isServer: _isServer }) => {
    // Suppress source map warnings from @google-cloud/firestore
    config.ignoreWarnings = [
      { module: /@google-cloud\/firestore/ },
    ];
    return config;
  },

  // Turbopack configuration (Next.js 16+)
  turbopack: {
    rules: {
      // Handle audio files
      '*.mp3': {
        loaders: ['file-loader'],
        as: '*.js',
      },
      '*.wav': {
        loaders: ['file-loader'],
        as: '*.js',
      },
    },
  },

  // Baseline security response headers applied to every route.
  // CSP is intentionally not set here — it requires per-page nonce wiring to
  // not break Next/inline scripts and is best handled in middleware.
  async headers() {
    return [
      {
        source: '/img/railway-japan-land.v1.svg',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // NOTE: Cross-origin isolation (COOP/COEP) for /games/shogi-improved was
      // intentionally REMOVED. It unlocked SharedArrayBuffer, which enabled the
      // multi-thread (Lazy SMP) search — but that parallel search deadlocked in
      // production (the page froze on "AI Thinking..." with no recovery), while
      // its strength benefit was only a ~+58 Elo point estimate (n=24, not
      // significant). Without these headers the page gets no SharedArrayBuffer
      // and the AI stays single-thread — the same stable path /games/shogi uses.
      // See shogiAiWorkerClient.ts (trySpawnSmpHelpers returns [] without SAB).
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },

  // The improved Shogi implementation is now served at the canonical
  // /games/shogi route. Permanently redirect the old /games/shogi-improved
  // URL (bookmarks, article links) to it so nothing 404s.
  async redirects() {
    return [
      {
        source: '/games/shogi-improved',
        destination: '/games/shogi',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
