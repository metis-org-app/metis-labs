/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker usa el build standalone; en Netlify (demo de presentación) el adaptador de Netlify arma su propio build.
  output: process.env.NETLIFY ? undefined : 'standalone',
};

export default nextConfig;
