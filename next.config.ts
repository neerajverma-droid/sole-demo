import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "**/*.{tsx,jsx}": {
        loaders: [
          {
            loader: "@locator/webpack-loader",
            options: { env: "development" },
          },
        ],
      },
    },
  },
  reactStrictMode: true,
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
  async redirects() {
    return [
      {
        source: "/resources",
        destination: "/widget",
        permanent: true,
      },
      {
        source: "/widget/tax-estimator",
        destination: "/tax-estimator",
        permanent: true,
      },
      {
        source: "/onboarding/business",
        destination: "/onboarding",
        permanent: true,
      },
      ...[
        { type: "query" as const, key: "code" },
        { type: "query" as const, key: "refer-code" },
        { type: "query" as const, key: "id", value: "accountant" },
      ].map((query) => ({
        source: "/auth",
        has: [query],
        destination: "/register",
        permanent: false,
      })),
      { source: "/auth", destination: "/login", permanent: false },
      { source: "/auth/login", destination: "/login", permanent: false },
      { source: "/auth/signup", destination: "/register", permanent: false },
      { source: "/signup", destination: "/register", permanent: false },
      { source: "/verify-email", destination: "/auth/verify-email", permanent: false },
      {
        source: "/login",
        has: [{ type: "query", key: "type", value: "signup" }],
        destination: "/register",
        permanent: false,
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: true, 
  },
};

export default nextConfig;
