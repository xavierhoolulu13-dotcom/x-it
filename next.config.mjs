/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  /**
   * Allow the E2B/Arena preview proxy to frame the app while keeping
   * clickjacking protection on for every other origin.
   */
  async headers() {
    /**
     * Clickjacking protection lives in `frame-ancestors` only.
     *
     * X-Frame-Options is deliberately NOT sent: browsers let it override the CSP
     * directive, so any host we allow to frame the app (a sandbox/preview proxy)
     * would still be blocked. Override the allow-list with
     * X_IT_FRAME_ANCESTORS="https://my-host" (space separated, CSP syntax).
     */
    const configured = process.env.X_IT_FRAME_ANCESTORS;
    const frameAncestors = configured
      ? ["'self'", ...configured.split(/\s+/).filter(Boolean)]
      : ["'self'", "https://*.e2b.app", "https://*.arena.ai"];

    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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
