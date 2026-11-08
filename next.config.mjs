const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  transpilePackages: ["@geiger/ui", "@geiger/notify"],
  basePath: isProd ? '/docs' : '',
  allowedDevOrigins: ['127.0.0.1'],
  env: {
    NEXT_PUBLIC_BASE_PATH: isProd ? '/docs' : '',
  },
  // The signing PDF renderer reads its embedded fonts from disk at runtime (lib/server/pdf/fonts.js).
  outputFileTracingIncludes: {
    '/api/signing/**': ['./lib/server/pdf/fonts/**/*'],
  },
};

export default nextConfig;
