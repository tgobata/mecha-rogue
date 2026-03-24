import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },
  // プライベートネットワーク全域を許可（スマホ開発時のIPが変わっても動作する）
  // Next.js はワイルドカードドメイン形式のみ対応（CIDR 不可）
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*'],
};

export default nextConfig;
