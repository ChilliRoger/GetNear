/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@getnear/shared", "@getnear/near-client"],
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = {
        type: "memory",
      };
    }
    return config;
  },
};

export default nextConfig;
