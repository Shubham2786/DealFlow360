/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@dealflow/shared'],
  // Allow verification/production builds to use a separate output dir so they never
  // clobber the `next dev` cache (mixing them corrupts `.next`). Default stays `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
