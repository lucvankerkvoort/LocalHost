import type { NextConfig } from "next";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const webpack = require("webpack");

const nextConfig: NextConfig = {
  // Turbopack config (Next.js 16 default)
  turbopack: {
    // Empty config to silence the warning
  },
  // Webpack config for production builds and fallback
  webpack: (config) => {
    config.plugins.push(
      new webpack.DefinePlugin({
        CESIUM_BASE_URL: JSON.stringify("cesium"),
      })
    );
    return config;
  },
  // Environment variables
  env: {
    CESIUM_BASE_URL: "cesium",
  },
};

export default nextConfig;
