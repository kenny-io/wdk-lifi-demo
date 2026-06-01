import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET (request) {
  const { searchParams } = new URL(request.url)
  const txHash = searchParams.get('txHash')
  const fromChain = searchParams.get('fromChain')
  const toChain = searchParams.get('toChain')

  if (!txHash) {
    return NextResponse.json({ error: 'Missing required query param: txHash' }, { status: 400 })
  }

  const headers = { 'Content-Type': 'application/json' }
  if (process.env.LIFI_API_KEY) headers['x-lifi-api-key'] = process.env.LIFI_API_KEY

  const params = new URLSearchParams({ txHash })
  if (fromChain) params.set('fromChain', fromChain)
  if (toChain) params.set('toChain', toChain)

  try {
    const res = await fetch(`https://li.quest/v1/status?${params.toString()}`, { headers })
    const data = await res.json()

    if (!res.ok) {
      const msg = data?.message || data?.error || `LI.FI error ${res.status}`
      return NextResponse.json({ error: msg }, { status: res.status })
    }

    return NextResponse.json({
      status: data.status,
      substatus: data.substatus ?? null,
      substatusMessage: data.substatusMessage ?? null,
      sending: data.sending
        ? { txHash: data.sending.txHash, chainId: data.sending.chainId }
        : undefined,
      receiving: data.receiving
        ? { txHash: data.receiving.txHash, chainId: data.receiving.chainId }
        : undefined,
      tool: data.tool ?? null,
      bridgeExplorerLink: data.bridgeExplorerLink ?? null,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
