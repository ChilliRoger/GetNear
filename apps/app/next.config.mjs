/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@getnear/shared", "@getnear/near-client"],
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
