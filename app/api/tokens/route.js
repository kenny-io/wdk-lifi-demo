import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET (request) {
  const { searchParams } = new URL(request.url)
  const chains = searchParams.get('chains')

  if (!chains) {
    return NextResponse.json({ error: 'Missing required query param: chains' }, { status: 400 })
  }

  const headers = { 'Content-Type': 'application/json' }
  if (process.env.LIFI_API_KEY) headers['x-lifi-api-key'] = process.env.LIFI_API_KEY

  try {
    const res = await fetch(`https://li.quest/v1/tokens?chains=${encodeURIComponent(chains)}`, { headers })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `LI.FI error: ${res.status} ${text}` }, { status: res.status })
    }
    const data = await res.json()
    // data.tokens is a map of chainId -> token[]
    // Return the flat list for the requested chain
    const chainId = String(chains)
    const tokenMap = data.tokens || {}
    const list = tokenMap[chainId] || Object.values(tokenMap)[0] || []
    const tokens = list.map(t => ({
      address: t.address,
      symbol: t.symbol,
      decimals: t.decimals,
      name: t.name,
      logoURI: t.logoURI ?? null,
      priceUSD: t.priceUSD ?? null,
    }))
    return NextResponse.json({ tokens })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
