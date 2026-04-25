const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  turbopack: {
    root: path.join(__dirname, '../..'),
  },
  transpilePackages: [
    '@ai-voiceover/contracts',
    '@ai-voiceover/db',
    '@ai-voiceover/auth',
    '@ai-voiceover/billing',
  ],
  serverExternalPackages: ['ws', 'bufferutil', 'utf-8-validate'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'supabase.co' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'img.clerk.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://api.openai.com https://*.clerk.com https://*.clerk.accounts.dev; " +
              "worker-src 'self' blob:; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: blob: https://*.supabase.co https://img.clerk.com; " +
              "font-src 'self' data:; " +
              "media-src 'self' blob: data:; " +
              "connect-src 'self' https://*.supabase.co https://api.openai.com https://api.stripe.com https://api.clerk.com https://*.clerk.accounts.dev https://clerk-telemetry.com https://api.x.ai wss://api.x.ai wss://*.supabase.co; " +
              "frame-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://js.stripe.com https://hooks.stripe.com; " +
              "frame-ancestors 'none';",
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;