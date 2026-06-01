import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST (request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { fromToken, toToken, fromChain, toChain, fromAmount, fromAddress, slippage } = body

  if (!fromToken || !toToken || !fromChain || !toChain || !fromAmount || !fromAddress) {
    return NextResponse.json(
      { error: 'Missing required fields: fromToken, toToken, fromChain, toChain, fromAmount, fromAddress' },
      { status: 400 }
    )
  }

  const headers = { 'Content-Type': 'application/json' }
  if (process.env.LIFI_API_KEY) headers['x-lifi-api-key'] = process.env.LIFI_API_KEY
  if (process.env.LIFI_INTEGRATOR) headers['x-lifi-integrator'] = process.env.LIFI_INTEGRATOR

  const params = new URLSearchParams({
    fromChain: String(fromChain),
    toChain: String(toChain),
    fromToken: String(fromToken),
    toToken: String(toToken),
    fromAmount: String(fromAmount),
    fromAddress: String(fromAddress),
    slippage: String(slippage ?? 0.005),
  })

  const denyBridges = process.env.LIFI_DENY_BRIDGES
  if (denyBridges) {
    denyBridges.split(',').forEach(b => params.append('denyBridges', b.trim()))
  }

  // LI.FI timing strategies — bound how long the API waits while aggregating
  // routes before responding, instead of blocking on every bridge/exchange.
  // Format: minWaitTime-<minWaitMs>-<startingExpectedResults>-<reduceEveryMs>.
  // Defaults return as soon as one usable route is found (the "fastest
  // response" profile); overridable via env. See https://docs.li.fi/guides/latency
  const swapTiming = process.env.LIFI_SWAP_TIMING ?? 'minWaitTime-600-1-300'
  const routeTiming = process.env.LIFI_ROUTE_TIMING ?? 'minWaitTime-900-1-300'
  params.append('swapStepTimingStrategies', swapTiming)
  params.append('routeTimingStrategies', routeTiming)

  try {
    const res = await fetch(`https://li.quest/v1/quote?${params.toString()}`, { headers })
    const data = await res.json()

    if (!res.ok) {
      const msg = data?.message || data?.error || `LI.FI error ${res.status}`
      return NextResponse.json({ error: msg }, { status: res.status })
    }

    // Locate the first step to extract transactionRequest and approvalAddress
    const steps = data.includedSteps ?? data.steps ?? []
    const firstStep = steps[0] ?? {}
    const estimate = data.estimate ?? firstStep.estimate ?? {}
    const action = data.action ?? firstStep.action ?? {}

    const gasCostUSD = (estimate.gasCosts ?? [])
      .reduce((sum, g) => sum + parseFloat(g.amountUSD ?? 0), 0)
      .toFixed(4)

    // The top-level step holds the real route tool. `includedSteps` may begin
    // with a `feeCollection` step (when an integrator fee is configured), so
    // never read the route name from it — and filter it out of the fallback.
    const isFeeStep = s => s.type === 'feeCollection' || s.tool === 'feeCollection'
    const bridgeSteps = steps.filter(s => !isFeeStep(s))
    const toolName =
      data.toolDetails?.name ??
      data.tool ??
      (bridgeSteps.map(s => s.toolDetails?.name ?? s.tool).filter(Boolean).join(' + ') || 'Unknown')

    return NextResponse.json({
      fromAmount: estimate.fromAmount ?? data.estimate?.fromAmount ?? String(fromAmount),
      toAmount: estimate.toAmount ?? '',
      toAmountMin: estimate.toAmountMin ?? '',
      fromAmountUSD: estimate.fromAmountUSD ?? null,
      toAmountUSD: estimate.toAmountUSD ?? null,
      executionDuration: estimate.executionDuration ?? null,
      gasCostUSD,
      tool: toolName,
      fromToken: action.fromToken ?? firstStep.action?.fromToken ?? null,
      toToken: action.toToken ?? firstStep.action?.toToken ?? null,
      transactionRequest: data.transactionRequest ?? null,
      approvalAddress: estimate.approvalAddress ?? null,
      skipApproval: !estimate.approvalAddress,
      fromChainId: action.fromChainId ?? fromChain,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
