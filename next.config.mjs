/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true, // For easier deployment to Vercel without image optimization costs, or keep false to use Next.js Image Optimization
  },
};

export default nextConfig;
