import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET () {
  const { SEED_PHRASE, RPC_URL } = process.env

  if (!SEED_PHRASE || !RPC_URL) {
    return NextResponse.json(
      { error: 'SEED_PHRASE and RPC_URL must be set in .env.local' },
      { status: 500 }
    )
  }

  try {
    const account = new WalletAccountEvm(SEED_PHRASE, "0'/0/0", { provider: RPC_URL })
    const address = await account.getAddress()
    return NextResponse.json({ address })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
