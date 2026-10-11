import type { NextConfig } from 'next';

// Trimmed so a stray space or trailing slash pasted into the hosting dashboard can't break the rewrite.
const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:5000').trim().replace(/\/+$/, '');

const nextConfig: NextConfig = {
  // Hide the "N" dev-tools button in development (it never appears in production builds).
  devIndicators: false,
  // Proxy /api/* to Express so the auth cookie is first-party and the browser never makes cross-origin calls.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
