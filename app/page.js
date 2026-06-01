'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ── Constants ────────────────────────────────────────────────────────────────

const NATIVE_ADDRS = new Set([
  '0x0000000000000000000000000000000000000000',
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
])

const EXPLORER_BASES = {
  1: 'https://etherscan.io/tx/',
  10: 'https://optimistic.etherscan.io/tx/',
  56: 'https://bscscan.com/tx/',
  137: 'https://polygonscan.com/tx/',
  8453: 'https://basescan.org/tx/',
  42161: 'https://arbiscan.io/tx/',
  43114: 'https://snowtrace.io/tx/',
  59144: 'https://lineascan.build/tx/',
  534352: 'https://scrollscan.com/tx/',
  324: 'https://explorer.zksync.io/tx/',
  100: 'https://gnosisscan.io/tx/',
  1101: 'https://zkevm.polygonscan.com/tx/',
  5000: 'https://explorer.mantle.xyz/tx/',
  81457: 'https://blastscan.io/tx/',
  7777777: 'https://explorer.zora.energy/tx/',
  34443: 'https://explorer.mode.network/tx/',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function truncate(addr, n = 6) {
  if (!addr) return ''
  return `${addr.slice(0, n)}…${addr.slice(-4)}`
}

function formatTokenAmount(raw, decimals, sigFigs = 6) {
  if (raw == null || decimals == null) return '—'
  const n = Number(raw) / Math.pow(10, decimals)
  if (isNaN(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: sigFigs, minimumFractionDigits: 2 })
}

function parseAmount(input, decimals) {
  if (!input || decimals == null) return 0n
  try {
    const [int, frac = ''] = input.split('.')
    const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0')
    return BigInt(int || '0') * BigInt(10 ** decimals) + BigInt(fracPadded || '0')
  } catch {
    return 0n
  }
}

function explorerTxLink(chainId, hash) {
  const base = EXPLORER_BASES[chainId]
  if (!base || !hash) return null
  return `${base}${hash}`
}

function isValidAmount(str) {
  if (!str) return false
  const n = parseFloat(str)
  return !isNaN(n) && n > 0
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TokenIcon({ token }) {
  const [imgErr, setImgErr] = useState(false)
  if (token?.logoURI && !imgErr) {
    return (
      <div className="token-icon">
        <img
          src={token.logoURI}
          alt={token.symbol}
          onError={() => setImgErr(true)}
        />
      </div>
    )
  }
  return (
    <div className="token-icon">
      {token?.symbol?.[0] ?? '?'}
    </div>
  )
}

function TxStep({ label, active, done, hash, chainId }) {
  const link = hash ? explorerTxLink(chainId, hash) : null
  return (
    <div className={`tx-step${active ? ' active' : done ? ' done' : ''}`}>
      <div className="tx-step-indicator">
        {done ? '✓' : active ? <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> : '○'}
      </div>
      <div className="tx-step-body">
        <div className="tx-step-label">{label}</div>
        {hash && (
          link
            ? <a className="tx-step-hash" href={link} target="_blank" rel="noopener noreferrer">{truncate(hash, 14)}</a>
            : <span className="tx-step-hash">{truncate(hash, 14)}</span>
        )}
      </div>
    </div>
  )
}

function QuotePreview({ quote }) {
  const [open, setOpen] = useState(true)
  const fromDecimals = quote.fromToken?.decimals ?? 6
  const toDecimals = quote.toToken?.decimals ?? 6
  const fromAmt = Number(quote.fromAmount) / Math.pow(10, fromDecimals)
  const toAmt = Number(quote.toAmount) / Math.pow(10, toDecimals)
  const rate = fromAmt > 0 ? (toAmt / fromAmt).toFixed(6) : '—'

  return (
    <div className="quote-preview">
      <div className="quote-preview-header" onClick={() => setOpen(o => !o)}>
        <span>1 {quote.fromToken?.symbol} ≈ {rate} {quote.toToken?.symbol}</span>
        <span className="chevron">{open ? '▴' : '▾'}</span>
      </div>
      {open && (
        <div className="quote-preview-body">
          <div className="q-row">
            <span>Route</span>
            <span>{quote.tool}</span>
          </div>
          <div className="q-row">
            <span>Est. time</span>
            <span>~{quote.executionDuration ?? '?'}s</span>
          </div>
          <div className="q-row">
            <span>Gas</span>
            <span>${parseFloat(quote.gasCostUSD || 0).toFixed(4)}</span>
          </div>
          <div className="q-row">
            <span>Min received</span>
            <span>
              {formatTokenAmount(quote.toAmountMin, toDecimals)} {quote.toToken?.symbol}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function ActionButton({ wallet, fromToken, toToken, toChainId, fromAmount, quote, quoteLoading, txState, onConnect, onExecute }) {
  if (!wallet.connected) {
    return (
      <button className="action-btn connect" onClick={onConnect}>
        Connect Wallet
      </button>
    )
  }
  if (txState.step === 'approving' || txState.step === 'bridging') {
    return (
      <button className="action-btn execute" disabled>
        <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
        {txState.step === 'approving' ? 'Approving…' : 'Bridging…'}
      </button>
    )
  }
  if (txState.step === 'done') {
    return (
      <button className="action-btn success" disabled>
        Bridge Submitted
      </button>
    )
  }
  if (!fromToken) {
    return <button className="action-btn disabled-reason" disabled>Select source token</button>
  }
  if (!toToken) {
    return <button className="action-btn disabled-reason" disabled>Select destination token</button>
  }
  if (!toChainId) {
    return <button className="action-btn disabled-reason" disabled>Select destination chain</button>
  }
  if (!isValidAmount(fromAmount)) {
    return <button className="action-btn disabled-reason" disabled>Enter amount</button>
  }
  if (quoteLoading) {
    return (
      <button className="action-btn execute" disabled>
        <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
        Fetching quote…
      </button>
    )
  }
  if (!quote) {
    return <button className="action-btn disabled-reason" disabled>Waiting for quote…</button>
  }
  if (txState.step === 'error') {
    return (
      <button className="action-btn execute" onClick={onExecute}>
        Retry Bridge
      </button>
    )
  }
  return (
    <button className="action-btn execute" onClick={onExecute}>
      Bridge Now
    </button>
  )
}

function TokenModal({ open, onClose, onSelect, tokens, search, onSearch, loading }) {
  const filtered = tokens
    .filter(t => {
      const q = search.toLowerCase()
      return (
        t.symbol?.toLowerCase().includes(q) ||
        t.name?.toLowerCase().includes(q) ||
        t.address?.toLowerCase().includes(q)
      )
    })
    .slice(0, 100)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Select Token</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-search-wrap">
          <input
            className="modal-search"
            placeholder="Search name, symbol, or address…"
            value={search}
            onChange={e => onSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="modal-token-list">
          {loading && (
            <div className="modal-empty">
              <span className="shimmer">Loading tokens…</span>
            </div>
          )}
          {!loading && filtered.map(t => (
            <button
              key={t.address}
              className="token-row"
              onClick={() => { onSelect(t); onClose(); onSearch('') }}
            >
              <TokenIcon token={t} />
              <div className="token-info">
                <span className="token-symbol">{t.symbol}</span>
                <span className="token-name">{t.name}</span>
              </div>
              {t.priceUSD && (
                <span className="token-price">${parseFloat(t.priceUSD).toFixed(3)}</span>
              )}
            </button>
          ))}
          {!loading && filtered.length === 0 && search && (
            <div className="modal-empty">No tokens found for "{search}"</div>
          )}
          {!loading && tokens.length === 0 && !search && (
            <div className="modal-empty">No tokens available for this chain</div>
          )}
        </div>
      </div>
    </div>
  )
}

function ChainSelector({ value, chains, onChange, placeholder = 'Destination chain…', disabled = false }) {
  return (
    <div className="chain-select-wrap">
      <select
        className="chain-selector"
        value={value ?? ''}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
      >
        <option value="">{placeholder}</option>
        {chains.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  )
}

function StatusCard({ txState, fromChainId, toChainId, statusData, statusLoading, onPoll }) {
  const [collapsed, setCollapsed] = useState(false)
  if (!txState.bridgeHash) return null

  const s = statusData?.status
  const isTerminal = s && ['DONE', 'FAILED', 'CANCELLED', 'PARTIAL', 'REFUNDED'].includes(s.toUpperCase())
  const isSuccess = s && ['DONE', 'PARTIAL', 'REFUNDED'].includes(s.toUpperCase())

  return (
    <div className="status-card fade-in">
      <div className="status-card-header" onClick={() => setCollapsed(c => !c)}>
        <span className="status-card-title">Settlement Status</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {s && (
            <span className={`status-badge ${isSuccess ? 'done' : isTerminal ? 'failed' : 'pending'}`}>
              {s}
            </span>
          )}
          {!isTerminal && !statusLoading && (
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-3)', padding: '0 4px' }}
              onClick={e => { e.stopPropagation(); onPoll() }}
              title="Refresh status"
            >
              ↻
            </button>
          )}
          {statusLoading && <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />}
          <span className="chevron" style={{ padding: 0, fontSize: 10 }}>{collapsed ? '▾' : '▴'}</span>
        </div>
      </div>
      {!collapsed && (
        <div className="status-card-body">
          <div className="status-row">
            <span className="status-row-key">Bridge tx</span>
            <a
              className="status-row-val"
              style={{ color: 'var(--accent)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 11 }}
              href={explorerTxLink(fromChainId, txState.bridgeHash) ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
            >
              {truncate(txState.bridgeHash, 14)}
            </a>
          </div>
          {statusData?.sending?.txHash && (
            <div className="status-row">
              <span className="status-row-key">Sending tx</span>
              <a
                className="status-row-val"
                style={{ color: 'var(--accent)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                href={explorerTxLink(statusData.sending.chainId ?? fromChainId, statusData.sending.txHash) ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
              >
                {truncate(statusData.sending.txHash, 14)}
              </a>
            </div>
          )}
          {statusData?.receiving?.txHash && (
            <div className="status-row">
              <span className="status-row-key">Receiving tx</span>
              <a
                className="status-row-val"
                style={{ color: 'var(--success)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                href={explorerTxLink(statusData.receiving.chainId ?? toChainId, statusData.receiving.txHash) ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
              >
                {truncate(statusData.receiving.txHash, 14)}
              </a>
            </div>
          )}
          {statusData?.substatusMessage && (
            <div className="status-row">
              <span className="status-row-key">Message</span>
              <span className="status-row-val" style={{ fontSize: 11 }}>{statusData.substatusMessage}</span>
            </div>
          )}
          {statusData?.bridgeExplorerLink && (
            <div className="status-row">
              <span className="status-row-key">Explorer</span>
              <a
                className="status-row-val"
                style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 11 }}
                href={statusData.bridgeExplorerLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on bridge explorer ↗
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Code panel ────────────────────────────────────────────────────────────────

function buildLines({ fromToken, toToken, toChainId, fromAmount }) {
  const fTok = fromToken?.address ? `'${fromToken.address}'` : "'<from-token>'"
  const tTok = toToken?.address   ? `'${toToken.address}'`   : "'<to-token>'"
  const chain = toChainId ? String(toChainId) : "'<to-chain>'"
  const amt   = fromAmount && parseFloat(fromAmount) > 0 ? fromAmount : '0'
  const decimals = fromToken?.decimals ?? 6
  const wei = amt === '0' ? '0n' : `${Math.round(parseFloat(amt) * 10 ** decimals)}n`

  return [
    { t: 'cm',    v: '// server-side only — API route / Node.js' },
    { t: 'kw',    v: 'import ', r: [
      { t: null, v: '{ ' }, { t: 'const', v: 'WalletAccountEvm' }, { t: null, v: ' } ' },
      { t: 'kw',  v: 'from ' }, { t: 'str', v: "'@tetherto/wdk-wallet-evm'" },
    ]},
    { t: 'kw',    v: 'import ', r: [
      { t: null, v: '{ ' }, { t: 'const', v: 'LifiSwidgeProtocol' }, { t: null, v: ' } ' },
      { t: 'kw',  v: 'from ' }, { t: 'str', v: "'@kenny_io/wdk-protocol-swidge-lifi'" },
    ]},
    { t: 'blank' },
    { t: 'cm',    v: '// 1 — Create the wallet account' },
    { t: 'kw',    v: 'const ', r: [
      { t: 'const', v: 'account' }, { t: null, v: ' = ' }, { t: 'kw', v: 'new ' },
      { t: 'fn',    v: 'WalletAccountEvm' }, { t: null, v: '(process.env.SEED_PHRASE, ' },
      { t: 'str',   v: '"0\'/0/0"' }, { t: null, v: ', {' },
    ]},
    { t: null,    v: '  provider: process.env.RPC_URL' },
    { t: null,    v: '})' },
    { t: 'blank' },
    { t: 'cm',    v: '// 2 — Attach the LI.FI Swidge protocol' },
    { t: 'kw',    v: 'const ', r: [
      { t: 'const', v: 'protocol' }, { t: null, v: ' = ' }, { t: 'kw', v: 'new ' },
      { t: 'fn',    v: 'LifiSwidgeProtocol' }, { t: null, v: '(account)' },
    ]},
    { t: 'blank' },
    { t: 'cm',    v: '// 3 — Quote (no transaction sent)' },
    { t: 'kw',    v: 'const ', r: [
      { t: 'const', v: 'quote' }, { t: null, v: ' = ' }, { t: 'kw', v: 'await ' },
      { t: null,    v: 'protocol.' }, { t: 'fn', v: 'quoteSwidge' }, { t: null, v: '({' },
    ]},
    { t: null,    v: '  fromToken: ', r: [{ t: 'str', v: fTok }] },
    { t: null,    v: '  toToken:   ', r: [{ t: 'str', v: tTok }] },
    { t: null,    v: '  toChain:   ', r: [{ t: 'num', v: chain }] },
    { t: null,    v: '  fromTokenAmount: ', r: [{ t: 'num', v: wei }] },
    { t: null,    v: '})' },
    { t: 'blank' },
    { t: 'cm',    v: '// quote.fromTokenAmount  → bigint' },
    { t: 'cm',    v: '// quote.toTokenAmount    → bigint' },
    { t: 'cm',    v: '// quote.fees[].type      → \'network\' | \'protocol\'' },
    { t: 'blank' },
    { t: 'cm',    v: '// 4 — Execute (approve + bridge)' },
    { t: 'kw',    v: 'const ', r: [
      { t: 'const', v: 'result' }, { t: null, v: ' = ' }, { t: 'kw', v: 'await ' },
      { t: null,    v: 'protocol.' }, { t: 'fn', v: 'swidge' }, { t: null, v: '({' },
    ]},
    { t: null,    v: '  fromToken: ', r: [{ t: 'str', v: fTok }] },
    { t: null,    v: '  toToken:   ', r: [{ t: 'str', v: tTok }] },
    { t: null,    v: '  toChain:   ', r: [{ t: 'num', v: chain }] },
    { t: null,    v: '  fromTokenAmount: ', r: [{ t: 'num', v: wei }] },
    { t: null,    v: '})' },
    { t: 'blank' },
    { t: 'cm',    v: '// result.id           — execution identifier' },
    { t: 'cm',    v: '// result.hash         — bridge tx hash' },
    { t: 'cm',    v: '// result.transactions — approval + source txs' },
    { t: 'blank' },
    { t: 'cm',    v: '// 5 — Track settlement' },
    { t: 'kw',    v: 'const ', r: [
      { t: 'const', v: '{ status }' }, { t: null, v: ' = ' }, { t: 'kw', v: 'await ' },
      { t: null,    v: 'protocol.' }, { t: 'fn', v: 'getSwidgeStatus' }, { t: null, v: '(result.id)' },
    ]},
    { t: 'cm',    v: '// \'pending\' | \'completed\' | \'failed\' | …' },
  ]
}

function CodeToken({ t, v, r }) {
  const cls = { kw: 't-kw', str: 't-str', const: 't-const', fn: 't-fn', num: 't-num', cm: 't-cm', dim: 't-dim' }
  return (
    <span className={cls[t] || ''}>
      {v}
      {r && r.map((tok, i) => <CodeToken key={i} {...tok} />)}
    </span>
  )
}

function CodePanel({ fromToken, toToken, toChainId, fromAmount, copied, onCopy }) {
  const lines = buildLines({ fromToken, toToken, toChainId, fromAmount })
  return (
    <aside className="code-side">
      <div className="code-toolbar">
        <div className="code-toolbar-left">
          <div className="traffic-lights">
            <div className="tl tl-red" /><div className="tl tl-yellow" /><div className="tl tl-green" />
          </div>
          <span className="code-filename">bridge.js</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="code-lang">JS</span>
          <button className={`copy-btn${copied ? ' copied' : ''}`} onClick={onCopy}>
            {copied ? '✓ Copied' : '⎘ Copy'}
          </button>
        </div>
      </div>
      <div className="code-scroll">
        <div className="code-block">
          {lines.map((line, i) => (
            <div key={i} className="code-line">
              <span className="code-line-num">{i + 1}</span>
              <span className="code-line-content">
                {line.t === 'blank' ? ' ' : <CodeToken {...line} />}
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BridgePage() {
  // Wallet
  const [wallet, setWallet] = useState({ address: null, chainId: null, connected: false, connecting: false })

  // Chain + token data
  const [chains, setChains] = useState([])
  const [toChainId, setToChainId] = useState(null)
  const [fromTokens, setFromTokens] = useState([])
  const [toTokens, setToTokens] = useState([])
  const [fromTokensLoading, setFromTokensLoading] = useState(false)
  const [toTokensLoading, setToTokensLoading] = useState(false)

  // Selected tokens
  const [fromToken, setFromToken] = useState(null)
  const [toToken, setToToken] = useState(null)

  // Amount + balance
  const [fromAmount, setFromAmount] = useState('')
  const [balance, setBalance] = useState(null)       // bigint
  const [balanceFormatted, setBalanceFormatted] = useState('')

  // Quote
  const [quote, setQuote] = useState(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState(null)

  // Token modal
  const [tokenModal, setTokenModal] = useState(null) // 'from' | 'to' | null
  const [tokenSearch, setTokenSearch] = useState('')

  // Tx execution
  const [txState, setTxState] = useState({
    step: null,        // 'approving' | 'bridging' | 'done' | 'error'
    approvalHash: null,
    bridgeHash: null,
    error: null,
  })

  // Status polling
  const [statusData, setStatusData] = useState(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const pollIntervalRef = useRef(null)

  // Recent txs (localStorage)
  const [recentTxs, setRecentTxs] = useState([])

  // Code panel copy
  const [copied, setCopied] = useState(false)

  // Debounced quote trigger
  const debouncedFromAmount = useDebounce(fromAmount, 500)

  // ── Load chains ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/chains')
      .then(r => r.json())
      .then(d => setChains(d.chains ?? []))
      .catch(() => {})
  }, [])

  // ── Load recent txs from localStorage ─────────────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = JSON.parse(localStorage.getItem('wdk_recent_txs') || '[]')
      setRecentTxs(Array.isArray(stored) ? stored.slice(0, 5) : [])
    } catch { /* ignore */ }
  }, [])

  // ── Wallet events ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return
    const onAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        setWallet({ address: null, chainId: null, connected: false, connecting: false })
      } else {
        setWallet(w => ({ ...w, address: accounts[0], connected: true }))
      }
    }
    const onChainChanged = (chainIdHex) => {
      setWallet(w => ({ ...w, chainId: parseInt(chainIdHex, 16) }))
      // Reset tokens + quote when chain changes
      setFromToken(null)
      setFromTokens([])
      setQuote(null)
      setQuoteError(null)
    }
    window.ethereum.on('accountsChanged', onAccountsChanged)
    window.ethereum.on('chainChanged', onChainChanged)
    return () => {
      window.ethereum.removeListener('accountsChanged', onAccountsChanged)
      window.ethereum.removeListener('chainChanged', onChainChanged)
    }
  }, [])

  // ── Connect wallet ─────────────────────────────────────────────────────────

  const connectWallet = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('MetaMask or a browser wallet is required.')
      return
    }
    setWallet(w => ({ ...w, connecting: true }))
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' })
      setWallet({ address: accounts[0], chainId: parseInt(chainIdHex, 16), connected: true, connecting: false })
    } catch (e) {
      setWallet(w => ({ ...w, connecting: false }))
      if (e.code !== 4001) console.error('connectWallet:', e)
    }
  }, [])

  // ── Switch origin chain (source = connected wallet network) ────────────────

  const switchChain = useCallback(async (chainId) => {
    if (!chainId || chainId === wallet.chainId) return
    if (typeof window === 'undefined' || !window.ethereum) return
    const hexId = '0x' + chainId.toString(16)
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexId }],
      })
      // The `chainChanged` event handler updates wallet.chainId + resets state.
    } catch (e) {
      // 4902 = chain unknown to the wallet → try to add it, then it becomes active.
      if (e.code === 4902 || e.code === -32603) {
        const chain = chains.find(c => c.id === chainId)
        const mm = chain?.metamask
        if (!mm) {
          alert(`Add ${chain?.name ?? `chain ${chainId}`} to your wallet manually, then select it.`)
          return
        }
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: hexId,
              chainName: mm.chainName ?? chain.name,
              nativeCurrency: mm.nativeCurrency,
              rpcUrls: mm.rpcUrls,
              blockExplorerUrls: mm.blockExplorerUrls,
            }],
          })
        } catch (addErr) {
          if (addErr.code !== 4001) console.error('addEthereumChain:', addErr)
        }
      } else if (e.code !== 4001) {
        console.error('switchChain:', e)
      }
    }
  }, [wallet.chainId, chains])

  // ── Copy code snippet ──────────────────────────────────────────────────────

  const handleCopy = useCallback(() => {
    const lines = buildLines({ fromToken, toToken, toChainId, fromAmount })
    const text = lines.map(l => {
      if (l.t === 'blank') return ''
      const flatten = tok => tok.v + (tok.r || []).map(flatten).join('')
      return flatten(l)
    }).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [fromToken, toToken, toChainId, fromAmount])

  // ── Load from-tokens when wallet chain changes ─────────────────────────────

  useEffect(() => {
    if (!wallet.chainId) return
    setFromTokensLoading(true)
    setFromTokens([])
    fetch(`/api/tokens?chains=${wallet.chainId}`)
      .then(r => r.json())
      .then(d => setFromTokens(d.tokens ?? []))
      .catch(() => {})
      .finally(() => setFromTokensLoading(false))
  }, [wallet.chainId])

  // ── Load to-tokens when destination chain changes ──────────────────────────

  useEffect(() => {
    if (!toChainId) return
    setToTokensLoading(true)
    setToTokens([])
    fetch(`/api/tokens?chains=${toChainId}`)
      .then(r => r.json())
      .then(d => setToTokens(d.tokens ?? []))
      .catch(() => {})
      .finally(() => setToTokensLoading(false))
  }, [toChainId])

  // ── Fetch balance ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!wallet.connected || !wallet.address || !fromToken) {
      setBalance(null)
      setBalanceFormatted('')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        let raw
        if (NATIVE_ADDRS.has(fromToken.address)) {
          // Native token
          const result = await window.ethereum.request({
            method: 'eth_getBalance',
            params: [wallet.address, 'latest'],
          })
          raw = BigInt(result)
        } else {
          // ERC-20 balanceOf
          const data = '0x70a08231' + wallet.address.slice(2).padStart(64, '0')
          const result = await window.ethereum.request({
            method: 'eth_call',
            params: [{ to: fromToken.address, data }, 'latest'],
          })
          raw = result && result !== '0x' ? BigInt(result) : 0n
        }
        if (cancelled) return
        setBalance(raw)
        setBalanceFormatted(formatTokenAmount(raw.toString(), fromToken.decimals))
      } catch {
        if (!cancelled) { setBalance(null); setBalanceFormatted('') }
      }
    })()
    return () => { cancelled = true }
  }, [wallet.connected, wallet.address, fromToken])

  // ── Auto-quote ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (
      !fromToken || !toToken || !toChainId || !wallet.address ||
      !isValidAmount(debouncedFromAmount) || !wallet.chainId
    ) {
      setQuote(null)
      setQuoteError(null)
      return
    }
    let cancelled = false
    setQuoteLoading(true)
    setQuoteError(null)
    const amountWei = parseAmount(debouncedFromAmount, fromToken.decimals)
    fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromToken: fromToken.address,
        toToken: toToken.address,
        fromChain: wallet.chainId,
        toChain: toChainId,
        fromAmount: amountWei.toString(),
        fromAddress: wallet.address,
        slippage: 0.005,
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.error) throw new Error(d.error)
        setQuote(d)
        setQuoteLoading(false)
      })
      .catch(e => {
        if (cancelled) return
        setQuote(null)
        setQuoteError(e.message)
        setQuoteLoading(false)
      })
    return () => { cancelled = true }
  }, [debouncedFromAmount, fromToken, toToken, toChainId, wallet.address, wallet.chainId])

  // ── MAX button ─────────────────────────────────────────────────────────────

  const handleMax = useCallback(() => {
    if (!balance || !fromToken) return
    const dec = fromToken.decimals
    const divisor = BigInt(10 ** dec)
    const intPart = balance / divisor
    const fracPart = balance % divisor
    const fracStr = fracPart.toString().padStart(dec, '0').replace(/0+$/, '')
    const formatted = fracStr ? `${intPart}.${fracStr}` : `${intPart}`
    setFromAmount(formatted)
  }, [balance, fromToken])

  // ── Execute ────────────────────────────────────────────────────────────────

  const execute = useCallback(async () => {
    if (!quote || !wallet.address) return
    setTxState({ step: null, approvalHash: null, bridgeHash: null, error: null })

    try {
      const { BrowserProvider } = await import('ethers')
      const provider = new BrowserProvider(window.ethereum)
      // Pass the already-connected address so ethers resolves the signer via
      // `eth_accounts` instead of firing a fresh `eth_requestAccounts`. The
      // latter throws a "-32603 could not coalesce" error when a wallet request
      // (e.g. a pending chain switch) is already in flight.
      const signer = await provider.getSigner(wallet.address)

      // Step 1: approval if needed
      if (!quote.skipApproval && quote.approvalAddress && quote.fromToken) {
        const amountWei = parseAmount(fromAmount, quote.fromToken.decimals)

        // Check current allowance
        const allowanceData =
          '0xdd62ed3e' +
          wallet.address.slice(2).padStart(64, '0') +
          quote.approvalAddress.slice(2).padStart(64, '0')
        const allowanceHex = await window.ethereum.request({
          method: 'eth_call',
          params: [{ to: quote.fromToken.address, data: allowanceData }, 'latest'],
        })
        const allowance = allowanceHex && allowanceHex !== '0x' ? BigInt(allowanceHex) : 0n

        if (allowance < amountWei) {
          setTxState(s => ({ ...s, step: 'approving' }))
          const approveData =
            '0x095ea7b3' +
            quote.approvalAddress.slice(2).padStart(64, '0') +
            amountWei.toString(16).padStart(64, '0')
          const approveTx = await signer.sendTransaction({
            to: quote.fromToken.address,
            data: approveData,
          })
          setTxState(s => ({ ...s, approvalHash: approveTx.hash }))
          await approveTx.wait()
        }
      }

      // Step 2: bridge transaction
      setTxState(s => ({ ...s, step: 'bridging' }))
      const tx = quote.transactionRequest
      const bridgeTx = await signer.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: BigInt(tx.value || '0x0'),
        ...(tx.gasLimit ? { gasLimit: BigInt(tx.gasLimit) } : {}),
      })
      setTxState(s => ({ ...s, bridgeHash: bridgeTx.hash, step: 'done' }))

      // Persist to localStorage
      const entry = {
        hash: bridgeTx.hash,
        fromChainId: wallet.chainId,
        toChainId,
        fromToken: { symbol: quote.fromToken?.symbol, logoURI: quote.fromToken?.logoURI },
        toToken: { symbol: quote.toToken?.symbol, logoURI: quote.toToken?.logoURI },
        amount: fromAmount,
        timestamp: Date.now(),
      }
      const updated = [entry, ...recentTxs].slice(0, 5)
      setRecentTxs(updated)
      if (typeof window !== 'undefined') {
        try { localStorage.setItem('wdk_recent_txs', JSON.stringify(updated)) } catch { /* ignore */ }
      }

      // Start polling
      startPolling(bridgeTx.hash, wallet.chainId, toChainId)
    } catch (e) {
      if (e.code === 4001 || e.code === 'ACTION_REJECTED') {
        // User rejected — just reset step
        setTxState(s => ({ ...s, step: null }))
      } else {
        // -32603 / "could not coalesce" means the wallet already has a request
        // pending (an open MetaMask popup). Surface a clear, actionable message
        // instead of the raw ethers error dump.
        const isPending =
          e.code === -32603 ||
          e.error?.code === -32603 ||
          /could not coalesce|already pending|request.*pending/i.test(e.message ?? '')
        const message = isPending
          ? 'Your wallet already has a pending request. Open your wallet to approve or dismiss it, then retry.'
          : (e.shortMessage ?? e.message ?? 'Transaction failed')
        setTxState(s => ({ ...s, step: 'error', error: message }))
      }
    }
  }, [quote, wallet.address, wallet.chainId, toChainId, fromAmount, recentTxs])

  // ── Status polling ─────────────────────────────────────────────────────────

  const pollStatus = useCallback(async (hash, fromChain, toChain) => {
    setStatusLoading(true)
    try {
      const params = new URLSearchParams({ txHash: hash })
      if (fromChain) params.set('fromChain', fromChain)
      if (toChain) params.set('toChain', toChain)
      const res = await fetch(`/api/status?${params.toString()}`)
      const d = await res.json()
      if (res.ok) {
        setStatusData(d)
        const s = (d.status ?? '').toUpperCase()
        if (['DONE', 'FAILED', 'CANCELLED', 'PARTIAL', 'REFUNDED'].includes(s)) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
      }
    } catch { /* ignore */ } finally {
      setStatusLoading(false)
    }
  }, [])

  const startPolling = useCallback((hash, fromChain, toChain) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    pollStatus(hash, fromChain, toChain)
    pollIntervalRef.current = setInterval(() => {
      pollStatus(hash, fromChain, toChain)
    }, 10000)
  }, [pollStatus])

  useEffect(() => {
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current) }
  }, [])

  // ── Derived ────────────────────────────────────────────────────────────────

  const fromChainName = wallet.chainId
    ? (chains.find(c => c.id === wallet.chainId)?.name ?? `Chain ${wallet.chainId}`)
    : 'Not connected'

  const toChainName = toChainId
    ? (chains.find(c => c.id === toChainId)?.name ?? `Chain ${toChainId}`)
    : null

  // ── Reset tx state when inputs change ─────────────────────────────────────

  useEffect(() => {
    setTxState({ step: null, approvalHash: null, bridgeHash: null, error: null })
    setStatusData(null)
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
  }, [fromToken, toToken, toChainId, fromAmount])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="app-shell">

      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <div className="header-logo" />
          <div>
            <div className="header-title">WDK LI.FI Demo</div>
            <div className="header-subtitle">@kenny_io/wdk-protocol-swidge-lifi</div>
          </div>
        </div>
        <div>
          {wallet.connected ? (
            <div className="wallet-chip">
              <div className="wallet-dot online" />
              <span>{truncate(wallet.address, 8)}</span>
              {toChainName && (
                <span style={{ color: 'var(--text-3)', borderLeft: '1px solid var(--success-bd)', paddingLeft: 8 }}>
                  {toChainName && `→ ${toChainName}`}
                </span>
              )}
            </div>
          ) : (
            <button className="connect-btn" onClick={connectWallet} disabled={wallet.connecting}>
              {wallet.connecting
                ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />Connecting…</>
                : 'Connect Wallet'
              }
            </button>
          )}
        </div>
      </header>

      <div className="main-content">
        <div className="form-side">
          <div className="widget-wrap">
            <div className="widget-card">

              {/* ── FROM section ── */}
              <div className="section-label">You Send</div>
              <div className="token-amount-row">
                <div className="token-col">
                  <ChainSelector
                    value={wallet.chainId}
                    chains={chains}
                    onChange={switchChain}
                    placeholder={wallet.connected ? 'Source chain…' : fromChainName}
                    disabled={!wallet.connected}
                  />
                  <button
                    className={`token-selector-btn${!fromToken ? ' placeholder' : ''}`}
                    onClick={() => setTokenModal('from')}
                    disabled={!wallet.connected}
                  >
                    {fromToken ? <TokenIcon token={fromToken} /> : <div className="token-icon">?</div>}
                    <span>{fromToken?.symbol ?? 'Select token'}</span>
                    <span className="chevron">▾</span>
                  </button>
                </div>
                <div className="amount-col">
                  <input
                    className="amount-input"
                    type="number"
                    value={fromAmount}
                    onChange={e => setFromAmount(e.target.value)}
                    placeholder="0.0"
                    min="0"
                  />
                  <div className="balance-row">
                    {balance != null && fromToken && (
                      <>
                        <span>Bal: {balanceFormatted}</span>
                        {balance > 0n && (
                          <button className="max-btn" onClick={handleMax}>MAX</button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Switch ── */}
              <div className="switch-row">
                <button
                  className="switch-btn"
                  title="Switch tokens"
                  onClick={() => {
                    // Swap tokens if both on same chain (not cross-chain swap direction)
                    const tmp = fromToken
                    setFromToken(toToken)
                    setToToken(tmp)
                    setFromAmount('')
                    setQuote(null)
                  }}
                >
                  ⇅
                </button>
              </div>

              {/* ── TO section ── */}
              <div className="section-label">You Receive</div>
              <div className="token-amount-row">
                <div className="token-col">
                  <ChainSelector value={toChainId} chains={chains} onChange={id => { setToChainId(id); setToToken(null) }} />
                  <button
                    className={`token-selector-btn${!toToken ? ' placeholder' : ''}`}
                    onClick={() => setTokenModal('to')}
                    disabled={!toChainId}
                  >
                    {toToken ? <TokenIcon token={toToken} /> : <div className="token-icon">?</div>}
                    <span>{toToken?.symbol ?? 'Select token'}</span>
                    <span className="chevron">▾</span>
                  </button>
                </div>
                <div className="amount-col amount-col-out">
                  <div className={`amount-out${quoteLoading ? ' loading-shimmer' : ''}`}>
                    {quoteLoading
                      ? <span className="shimmer">—</span>
                      : quote
                        ? formatTokenAmount(quote.toAmount, quote.toToken?.decimals ?? 6)
                        : '—'
                    }
                  </div>
                  {quote?.toAmountUSD && (
                    <div className="amount-usd">
                      ≈ ${parseFloat(quote.toAmountUSD).toFixed(2)}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Quote preview ── */}
              {quote && !quoteLoading && <QuotePreview quote={quote} />}
              {quoteError && <div className="quote-error">{quoteError}</div>}

              {/* ── Tx progress ── */}
              {(txState.step === 'approving' || txState.approvalHash || txState.step === 'bridging' || txState.bridgeHash) && (
                <div className="tx-progress fade-in">
                  <TxStep
                    label="Approve token spend"
                    active={txState.step === 'approving'}
                    done={!!txState.approvalHash}
                    hash={txState.approvalHash}
                    chainId={wallet.chainId}
                  />
                  <TxStep
                    label="Submit bridge transaction"
                    active={txState.step === 'bridging'}
                    done={txState.step === 'done' || !!txState.bridgeHash}
                    hash={txState.bridgeHash}
                    chainId={wallet.chainId}
                  />
                </div>
              )}

              {txState.step === 'error' && txState.error && (
                <div className="quote-error fade-in" style={{ marginTop: 10 }}>
                  {txState.error}
                </div>
              )}

              {/* ── Action button ── */}
              <ActionButton
                wallet={wallet}
                fromToken={fromToken}
                toToken={toToken}
                toChainId={toChainId}
                fromAmount={fromAmount}
                quote={quote}
                quoteLoading={quoteLoading}
                txState={txState}
                onConnect={connectWallet}
                onExecute={execute}
              />
            </div>

            {/* ── Status card (below widget) ── */}
            <StatusCard
              txState={txState}
              fromChainId={wallet.chainId}
              toChainId={toChainId}
              statusData={statusData}
              statusLoading={statusLoading}
              onPoll={() => txState.bridgeHash && pollStatus(txState.bridgeHash, wallet.chainId, toChainId)}
            />

            {/* ── Recent transactions ── */}
            {recentTxs.length > 0 && (
              <div className="recent-txs fade-in">
                <div className="recent-txs-title">Recent Transactions</div>
                {recentTxs.map((tx, i) => (
                  <div key={tx.hash + i} className="recent-tx-item">
                    <TokenIcon token={tx.fromToken} />
                    <div className="recent-tx-info">
                      <div className="recent-tx-label">
                        {tx.amount} {tx.fromToken?.symbol} → {tx.toToken?.symbol}
                      </div>
                      {explorerTxLink(tx.fromChainId, tx.hash) ? (
                        <a
                          className="recent-tx-hash"
                          href={explorerTxLink(tx.fromChainId, tx.hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {truncate(tx.hash, 14)}
                        </a>
                      ) : (
                        <span className="recent-tx-hash">{truncate(tx.hash, 14)}</span>
                      )}
                    </div>
                    <span className={`status-badge ${tx.status === 'DONE' ? 'done' : 'pending'}`}>
                      {tx.status ?? 'pending'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Code panel */}
        <CodePanel
          fromToken={fromToken}
          toToken={toToken}
          toChainId={toChainId}
          fromAmount={fromAmount}
          copied={copied}
          onCopy={handleCopy}
        />
      </div>

      {/* ── Token modals ── */}
      <TokenModal
        open={tokenModal === 'from'}
        onClose={() => setTokenModal(null)}
        onSelect={setFromToken}
        tokens={fromTokens}
        search={tokenSearch}
        onSearch={setTokenSearch}
        loading={fromTokensLoading}
      />
      <TokenModal
        open={tokenModal === 'to'}
        onClose={() => setTokenModal(null)}
        onSelect={setToToken}
        tokens={toTokens}
        search={tokenSearch}
        onSearch={setTokenSearch}
        loading={toTokensLoading}
      />
    </div>
  )
}
