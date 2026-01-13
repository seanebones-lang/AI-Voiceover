/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbo: {
      resolveAlias: {
        'onnxruntime-node': 'onnxruntime-node',
      },
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
  // Increase body size limit for audio uploads
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
    responseLimit: false,
  },
}

module.exports = nextConfig
