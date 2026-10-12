/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async redirects() {
    // Earlier versions used /dashboard/agents/...; keep old bookmarks working.
    return [
      { source: '/dashboard/agents/new', destination: '/dashboard/presenters/new', permanent: true },
      { source: '/dashboard/agents/:id/widget', destination: '/dashboard/preview/:id', permanent: true },
      { source: '/dashboard/agents/:id', destination: '/dashboard/presenters/:id', permanent: true },
    ];
  },
};

module.exports = nextConfig;
