import React, { useState } from 'react'
import { useTheme } from '@mui/material/styles'
import { fetchIpapi, type IpapiPretty } from '../utils/ipapi'
import { IpNote } from './IpNote'

export function ClientIpCell({ ip, ipapiEnabled }: { ip: string; ipapiEnabled: boolean }) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const [note, setNote] = useState<null | { rect: DOMRect; data?: IpapiPretty; error?: string }>(null)

  const isRoutable = (() => {
    if (!ip) return false
    const m = ip.match(/^\d+\.\d+\.\d+\.\d+$/)
    if (!m) return true // let server validate IPv6/others
    const [a, b] = ip.split('.').map(n => parseInt(n, 10))
    if (a === 10) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 127) return false
    if (a === 169 && b === 254) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    return true
  })()

  function onClick(e: React.MouseEvent<HTMLSpanElement>) {
    if (!ipapiEnabled || !isRoutable) return
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setNote({ rect })
    fetchIpapi(ip)
      .then(data => setNote({ rect, data }))
      .catch(err => setNote({ rect, error: err.message }))
  }

  if (!ip) return <span>-</span>
  if (!ipapiEnabled || !isRoutable) {
    return <span>{ip}</span>
  }

  const loaderStyles: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(window.innerWidth - 200, Math.max(8, (note?.rect.left || 0))),
    top: Math.min(window.innerHeight - 80, Math.max(8, (note?.rect.bottom || 0) + 6)),
    background: isDark ? (theme.palette.background.paper || '#1e1e1e') : '#fffdf0',
    color: theme.palette.text.primary,
    border: `1px solid ${isDark ? (theme.palette.divider || '#3a3a3a') : '#e6d790'}`,
    borderRadius: 8,
    padding: 8,
    zIndex: 1000,
    fontSize: 12.5,
    boxShadow: isDark ? '0 8px 28px rgba(0,0,0,0.6)' : '0 6px 24px rgba(0,0,0,0.15)'
  }

  return (
    <>
      <span onClick={onClick} style={{ cursor: 'pointer', color: 'inherit', textDecoration: 'underline dotted' }}>{ip}</span>
      {note && (
        note.error ? (
          <IpNote data={{ ip, location: {} } as any} error={note.error} anchorRect={note.rect} onClose={() => setNote(null)} />
        ) : note.data ? (
          <IpNote data={note.data} anchorRect={note.rect} onClose={() => setNote(null)} />
        ) : (
          <div style={loaderStyles}>Loading IP info…</div>
        )
      )}
    </>
  )
}
