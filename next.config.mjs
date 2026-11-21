/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["@prisma/client", "prisma"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
