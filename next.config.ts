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
    // A build on Vercel ships without the shogi AI's 94.7MB weights (.vercelignore), and its worker fetches them from
    // the public asset bucket instead; anywhere else they are in public/ as before. See ShogiImproved/weightsAsset.ts.
    NEXT_PUBLIC_SHOGI_WEIGHTS_REMOTE: process.env.VERCEL === "1" ? "1" : "",
    // Only a build on Vercel sends activity logs on to production's activity_logs; CI's e2e server and a developer's
    // server drop them. See src/app/api/_lib/activityLogForwarding.ts.
    ACTIVITY_LOG_BUILT_ON_VERCEL: process.env.VERCEL === "1" ? "1" : "",
  },

  // Disable React StrictMode to suppress warnings from third-party packages
  reactStrictMode: false,

  experimental: {
    // How Turbopack groups CSS modules into the stylesheets a route links. The default ("loose") merged the
    // modules of unrelated routes into shared files: every medal machine linked Baccarat's, Blackjack's,
    // Craps', Fishing's, Janken's, Mahjong's and the shogi pieces' styles (about 36 KB brotli of
    // render-blocking CSS it never uses), and the home page and /blog the memory dashboard's, /projects',
    // /growth's and /tools'. "graph" groups modules by the routes that import them together. On this app
    // it links less CSS on every route (none more; 12 routes link one more, smaller file), and every route
    // still renders with the same computed styles.
    cssChunking: 'graph',
    // Don't reuse Turbopack's build cache (on by default since Next 16.3; Vercel restores `.next/cache` from the
    // previous deployment). On Vercel it shipped src/app/globals.css one deployment late: the #996 build served
    // the stylesheet as it was before #996, and the build that reverted #996 served #996's version. Every
    // build now compiles from source.
    turbopackFileSystemCacheForBuild: false,
  },

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
      // Cross-origin isolation for the shogi engine's multi-thread (Lazy SMP)
      // search. Isolation exposes SharedArrayBuffer, which the AI worker uses to
      // share a transposition table across a main + N helper worker threads
      // (see shogiAiWorkerClient.ts). Scoped to /games/shogi only so the rest of
      // the site keeps embedding third-party resources normally.
      //
      // IMPORTANT — the whole-history freeze fix lives here. Under COEP
      // require-corp, a dedicated Worker's OWN script response must assert a
      // compatible embedder policy, or the browser blocks it
      // (net::ERR_BLOCKED_BY_RESPONSE) — CORP:same-origin alone is not enough
      // for the worker top-level script. Without COEP on the worker chunks the
      // AI worker never boots and every search hangs ("AI Thinking..." forever).
      // That was the real cause of the historical freeze (NOT a Lazy SMP
      // deadlock — it reproduced even single-thread). Hence COEP:require-corp on
      // /_next/* below, alongside CORP so the isolated document can embed them.
      {
        source: '/games/shogi',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
      {
        // Unlinked, exact-query browser/Worker parity harness. Keep the
        // canonical game page static while giving diagnostics the same
        // cross-origin isolation contract as real play.
        source: '/games/shogi/engine-parity',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
      {
        // Next build output: CORP so the isolated document can embed it, and
        // COEP so the AI worker's script chunks (turbopack-worker-*.js) load
        // instead of being blocked (see note above).
        source: '/_next/:path*',
        headers: [
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
      {
        // Static engine assets fetched by the worker under require-corp.
        source: '/shogi-nnue-weights.bin',
        headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }],
      },
      {
        source: '/shogi-halfkp81-production-weights.bin',
        headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }],
      },
      {
        source: '/shogi-opening-book-v3.bin',
        headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }],
      },
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
};

export default nextConfig;
