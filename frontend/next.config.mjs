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
    const isProd = process.env.NODE_ENV === 'production';
    const backendPort = process.env.BACKEND_PORT || (isProd ? '8010' : '8000');
    const defaultBackend = `http://127.0.0.1:${backendPort}`;
    const rawBackend = process.env.INTERNAL_BACKEND_URL || (process.env.NEXT_PUBLIC_BACKEND_URL ? process.env.NEXT_PUBLIC_BACKEND_URL : defaultBackend);
    const backendUrl = rawBackend.replace(/\/+$/, '');

    return [
      {
        source: '/api/media/:path*',
        destination: `${backendUrl}/api/media/:path*`,
      },
      {
        source: '/static/:path*',
        destination: `${backendUrl}/static/:path*`,
      },
      {
        source: '/api/py/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
