import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'
import { LifiSwidgeProtocol } from '@kenny_io/wdk-protocol-swidge-lifi'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST (request) {
  const { SEED_PHRASE, RPC_URL, LIFI_INTEGRATOR, LIFI_API_KEY, LIFI_DENY_BRIDGES, LIFI_TO_TOKEN, LIFI_SLIPPAGE } = process.env

  if (!SEED_PHRASE || !RPC_URL) {
    return NextResponse.json(
      { error: 'SEED_PHRASE and RPC_URL must be set in .env.local' },
      { status: 500 }
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { token, amount, targetChain, recipient } = body

  if (!token || !amount || !targetChain || !recipient) {
    return NextResponse.json(
      { error: 'Missing required fields: token, amount, targetChain, recipient' },
      { status: 400 }
    )
  }

  try {
    const account = new WalletAccountEvm(SEED_PHRASE, "0'/0/0", { provider: RPC_URL })

    const protocol = new LifiSwidgeProtocol(account, {
      ...(LIFI_INTEGRATOR && { integrator: LIFI_INTEGRATOR }),
      ...(LIFI_API_KEY && { apiKey: LIFI_API_KEY }),
      ...(LIFI_DENY_BRIDGES && { denyBridges: LIFI_DENY_BRIDGES.split(',').map(s => s.trim()) })
    })

    const result = await protocol.swidge({
      fromToken: token,
      toToken: LIFI_TO_TOKEN || token,
      toChain: targetChain,
      recipient,
      fromTokenAmount: BigInt(amount),
      ...(LIFI_SLIPPAGE && { slippage: parseFloat(LIFI_SLIPPAGE) })
    })

    const fee = result.fees
      .filter(f => f.type === 'network')
      .reduce((s, f) => s + f.amount, 0n)

    const bridgeFee = result.fees
      .filter(f => f.type === 'protocol')
      .reduce((s, f) => s + f.amount, 0n)

    // Extract approval and reset hashes from transactions array
    const approvalTxs = (result.transactions || []).filter(t => t.type === 'approval')
    const approveHash = approvalTxs.length > 0
      ? approvalTxs[approvalTxs.length - 1].hash  // last approval = the grant (not the reset)
      : undefined
    const resetAllowanceHash = approvalTxs.length > 1
      ? approvalTxs[0].hash  // first approval = the reset-to-zero
      : undefined

    return NextResponse.json({
      hash: result.hash,
      fee: fee.toString(),
      bridgeFee: bridgeFee.toString(),
      ...(approveHash && { approveHash }),
      ...(resetAllowanceHash && { resetAllowanceHash }),
      transactions: result.transactions.map(t => ({ hash: t.hash, type: t.type, chain: t.chain }))
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
