/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable compression
  compress: true,

  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  
  turbopack: {
    resolveAlias: {
      'onnxruntime-node': 'onnxruntime-node',
    },
  },
  
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude onnxruntime-node from client bundle
      config.externals = config.externals || [];
      config.externals.push('onnxruntime-node');
    }
    
    // Optimize bundle size
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
        runtimeChunk: 'single',
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              priority: 10,
            },
            common: {
              minChunks: 2,
              priority: 5,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }
    
    return config;
  },
  
  // Allow large model files
  serverExternalPackages: ['onnxruntime-node'],
  
  // Headers for performance
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
        ],
      },
    ];
  },
}

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
})

module.exports = withBundleAnalyzer(nextConfig)
