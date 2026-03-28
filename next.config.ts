import type { NextConfig } from 'next';
import { execSync } from 'child_process';

function getGitCommitDate(): string {
  try {
    return execSync('git log -1 --format="%ad" --date=format:"%Y.%m.%d.%H.%M.%S"', { encoding: 'utf8' }).trim();
  } catch {
    return new Date().toISOString().replace(/[-T:.Z]/g, '.').slice(0, 19).replace(/\./g, '.');
  }
}

const nextConfig: NextConfig = {
  output: 'export',
  env: {
    NEXT_PUBLIC_BUILD_VERSION: getGitCommitDate(),
  },
  reactCompiler: true,
  turbopack: {
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },
  // プライベートネットワーク全域を許可（スマホ開発時のIPが変わっても動作する）
  // Next.js はワイルドカードドメイン形式のみ対応（CIDR 不可）
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*'],
};

export default nextConfig;
