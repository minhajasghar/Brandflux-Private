/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/py/:path*',
        destination: process.env.INTERNAL_BACKEND_URL || 'http://127.0.0.1:8010/:path*',
      },
    ];
  },
};

export default nextConfig;
