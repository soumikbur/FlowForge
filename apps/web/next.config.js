/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@flowforge/shared",
    "@flowforge/config",
    "@flowforge/workflow-engine",
  ],
};

module.exports = nextConfig;
