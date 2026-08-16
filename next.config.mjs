/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: no server, nothing to keep awake, nothing to pause.
  output: "export",
  images: { unoptimized: true },
};
export default nextConfig;
