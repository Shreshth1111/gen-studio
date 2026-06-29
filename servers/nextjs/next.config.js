/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8085"}/api/:path*`,
      },
      {
        source: "/app_data/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8085"}/app_data/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**" },
    ],
  },
  // Disable response buffering for SSE streams
  experimental: {
    proxyTimeout: 600000,
  },
};

module.exports = nextConfig;
