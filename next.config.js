/** @type {import('next').NextConfig} */
const nextConfig = {
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
    return config;
  },
  // Allow large model files
  serverExternalPackages: ['onnxruntime-node'],
}

module.exports = nextConfig
