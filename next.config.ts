import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable React StrictMode to suppress warnings from third-party packages
  reactStrictMode: false,

  // Enable SCSS support
  sassOptions: {
    includePaths: ['./src/assets/scss'],
  },

  // Image optimization configuration
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
    ],
  },

  // Webpack configuration to suppress source map warnings
  webpack: (config, { isServer }) => {
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
};

export default nextConfig;
