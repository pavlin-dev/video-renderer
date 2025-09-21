import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { dev, isServer }) => {
    // Ignore @ffmpeg-installer dynamic imports in client-side builds
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }

    // Handle @ffmpeg-installer for server-side rendering
    config.externals = config.externals || [];
    config.externals.push({
      '@ffmpeg-installer/ffmpeg': '@ffmpeg-installer/ffmpeg',
    });

    return config;
  },
};

export default nextConfig;