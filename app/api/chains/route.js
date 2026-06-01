import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET () {
  const headers = { 'Content-Type': 'application/json' }
  if (process.env.LIFI_API_KEY) headers['x-lifi-api-key'] = process.env.LIFI_API_KEY

  try {
    const res = await fetch('https://li.quest/v1/chains?chainTypes=EVM', { headers })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `LI.FI error: ${res.status} ${text}` }, { status: res.status })
    }
    const data = await res.json()
    const chains = (data.chains || []).map(c => ({
      id: c.id,
      name: c.name,
      chainType: c.chainType,
      nativeSymbol: c.nativeToken?.symbol ?? 'ETH',
      logoURI: c.logoURI ?? null,
      // MetaMask `wallet_addEthereumChain` params, used as a fallback when the
      // wallet doesn't already know the chain the user switches the origin to.
      metamask: c.metamask ?? null,
    }))
    return NextResponse.json({ chains })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
