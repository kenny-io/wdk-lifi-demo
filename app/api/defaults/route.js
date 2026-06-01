import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET () {
  const { TOKEN_ADDRESS, AMOUNT, TARGET_CHAIN, RECIPIENT_ADDRESS } = process.env

  return NextResponse.json({
    token: TOKEN_ADDRESS || '',
    amount: AMOUNT || '',
    targetChain: TARGET_CHAIN || 'base',
    recipient: RECIPIENT_ADDRESS || ''
  })
}
