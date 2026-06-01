/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep these ESM-only packages as server-side externals so Next.js
  // doesn't try to bundle them through webpack.
  serverExternalPackages: [
    '@kenny_io/wdk-protocol-swidge-lifi',
    '@tetherto/wdk-wallet-evm',
    '@tetherto/wdk-wallet',
    'ethers'
  ]
}

export default nextConfig
