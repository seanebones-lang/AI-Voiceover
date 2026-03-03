/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Ensure API routes and server components work
  experimental: {},
}

module.exports = nextConfig
