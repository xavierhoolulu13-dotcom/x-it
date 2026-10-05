/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  /**
   * Allow the E2B/Arena preview proxy to frame the app while keeping
   * clickjacking protection on for every other origin.
   */
  async headers() {
    const previewOrigin = process.env.X_IT_PREVIEW_ORIGIN;
    const frameAncestors = ["'self'", "https://*.e2b.app", "https://*.arena.ai"];
    if (previewOrigin) frameAncestors.push(previewOrigin);

    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      {
        key: "Content-Security-Policy",
        value: `frame-ancestors ${frameAncestors.join(" ")}`,
      },
    ];

    return [
      { source: "/:path*", headers: securityHeaders },
      // Screenshots and live previews are embedded cross-origin by the app.
      {
        source: "/api/browser/:path*",
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }],
      },
      {
        source: "/api/preview/:path*",
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }],
      },
    ];
  },
  experimental: {
    serverComponentsExternalPackages: [
      'dockerode',
      '@prisma/client',
      'puppeteer-core',
      '@sparticuz/chromium',
      'bcryptjs',
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Browser automation and container control must run in Node, not be bundled.
  webpack: (config) => {
    config.externals = [
      ...(config.externals || []),
      'dockerode',
      'puppeteer-core',
      '@sparticuz/chromium',
    ];
    return config;
  },
};

export default nextConfig;
