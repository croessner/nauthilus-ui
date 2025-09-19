import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTheme } from '@mui/material/styles'
import type { IpapiPretty } from '../utils/ipapi'

export function IpNote({ data, onClose, anchorRect, error }: {
  data: IpapiPretty
  onClose: () => void
  anchorRect: DOMRect
  error?: string
}) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: Math.max(8, anchorRect.left),
    top: Math.max(8, anchorRect.bottom + 6)
  })

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])


  // After mount/update, measure size and clamp into viewport for optimal positioning
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const margin = 8
    const left = Math.min(window.innerWidth - w - margin, Math.max(margin, anchorRect.left))
    const top = Math.min(window.innerHeight - h - margin, Math.max(margin, anchorRect.bottom + 6))
    setPos({ left, top })
  }, [anchorRect, data])

  const L = data.location || {}
  const TZ = data.time_zone || {}
  const CONN = data.connection || {}
  const CAR = data.carrier || {}

  // Colors for light/dark
  const bg = isDark ? (theme.palette.background.paper || '#1e1e1e') : '#fffdf0'
  const fg = theme.palette.text.primary || (isDark ? '#e6e6e6' : '#333')
  const border = isDark ? (theme.palette.divider || '#3a3a3a') : '#e6d790'
  const shadow = isDark ? '0 8px 28px rgba(0,0,0,0.6)' : '0 6px 24px rgba(0,0,0,0.15)'
  const dangerBg = isDark ? 'rgba(120,0,0,0.25)' : '#fff3f3'
  const dangerBorder = isDark ? '#a44' : '#f0b3b3'
  const dangerFg = isDark ? '#ffb3b3' : '#a40000'

  // Compact rendering helpers
  const valueStyle: React.CSSProperties = { overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%' }
  const formatCurrentTime = (s?: string): string => {
    if (!s) return ''
    try {
      // Prefer a compact, locale-independent format: YYYY-MM-DD HH:mm:ss
      const d = new Date(s)
      if (isNaN(d.getTime())) return s
      const pad = (n: number) => String(n).padStart(2, '0')
      const y = d.getFullYear()
      const m = pad(d.getMonth() + 1)
      const day = pad(d.getDate())
      const hh = pad(d.getHours())
      const mm = pad(d.getMinutes())
      const ss = pad(d.getSeconds())
      return `${y}-${m}-${day} ${hh}:${mm}:${ss}`
    } catch {
      return s
    }
  }

  return (
    <div ref={ref} style={{
      position: 'fixed', left: pos.left, top: pos.top, zIndex: 1000,
      background: bg, color: fg, border: `1px solid ${border}`, borderRadius: 8,
      boxShadow: shadow, padding: 10, fontFamily: 'system-ui, sans-serif', fontSize: 12.5,
      width: 'auto', minWidth: 260, maxWidth: 'min(80vw, 420px)',
      maxHeight: 'min(70vh, 520px)', overflowY: 'auto',
      wordBreak: 'break-word', overflowWrap: 'anywhere'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{ fontSize: 18 }}>📍</div>
        <div style={{ fontWeight: 600, flex: '0 1 auto' }}>
          {data.ip} {L.flag_emoji ? <span style={{ marginLeft: 6 }}>{L.flag_emoji}</span> : null}
        </div>
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'transparent', color: fg, border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {error && (
        <div style={{ marginBottom: 8, padding: 8, background: dangerBg, border: `1px solid ${dangerBorder}`, borderRadius: 6, color: dangerFg }}>
          {error}
        </div>
      )}

      {data.hostname && <div style={{ marginBottom: 6 }}><b>Hostname:</b> <span style={valueStyle}>{data.hostname}</span></div>}

      <div style={{ marginBottom: 6 }}>
        <b>Location:</b> <span style={valueStyle}>{[L.city, L.region, L.country].filter(Boolean).join(', ') || '–'}</span>
      </div>
      <div style={{ marginBottom: 8 }}>
        <b>Coordinates:</b> <span style={valueStyle}>{L.lat && L.lon ? `${L.lat.toFixed(4)}, ${L.lon.toFixed(4)}` : '–'}</span>
      </div>


      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 6 }}>
        <div><b>Continent:</b> <span style={valueStyle}>{L.continent || '–'}{L.continent_code ? ` (${L.continent_code})` : ''}</span></div>
        <div><b>Country:</b> <span style={valueStyle}>{L.country || '–'}{L.country_code ? ` (${L.country_code})` : ''}</span></div>
        <div><b>Region:</b> <span style={valueStyle}>{L.region || '–'}{L.region_code ? ` (${L.region_code})` : ''}</span></div>
        <div><b>ZIP:</b> <span style={valueStyle}>{L.zip || '–'}</span></div>
        <div><b>Capital:</b> <span style={valueStyle}>{L.capital || '–'}</span></div>
        <div><b>EU member:</b> <span style={valueStyle}>{typeof L.is_eu === 'boolean' ? (L.is_eu ? 'Yes' : 'No') : '–'}</span></div>
        <div><b>Languages:</b> <span style={valueStyle}>{Array.isArray(L.languages) && L.languages.length ? L.languages.join(', ') : '–'}</span></div>
        <div><b>Calling code:</b> <span style={valueStyle}>{L.calling_code || '–'}</span></div>
        {L.country_flag && <div><b>Flag:</b> <img src={L.country_flag} alt="flag" style={{ height: 12, verticalAlign: 'middle', marginLeft: 4 }} /></div>}
      </div>

      {(CONN.isp || CONN.org || CONN.asn || data.type || CONN.type || data.connection_type || data.ip_routing_type) && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Network</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 6 }}>
            <div><b>ISP:</b> <span style={valueStyle}>{CONN.isp || L.isp || '–'}</span></div>
            <div><b>Org:</b> <span style={valueStyle}>{CONN.org || L.org || '–'}</span></div>
            <div><b>ASN:</b> <span style={valueStyle}>{CONN.asn || L.asn || '–'}</span></div>
            <div><b>Routing:</b> <span style={valueStyle}>{data.ip_routing_type || '–'}</span></div>
            <div><b>Connection:</b> <span style={valueStyle}>{data.connection_type || CONN.type || '–'}</span></div>
            <div><b>IP version:</b> <span style={valueStyle}>{data.type || '–'}</span></div>
          </div>
        </div>
      )}

      {(TZ.id || TZ.code || TZ.current_time) && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Time zone</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 6 }}>
            <div><b>ID:</b> <span style={valueStyle}>{TZ.id || L.time_zone || '–'}</span></div>
            <div><b>Abbr:</b> <span style={valueStyle}>{TZ.code || '–'}</span></div>
            <div><b>Current time:</b> <span style={valueStyle}>{formatCurrentTime(TZ.current_time) || '–'}</span></div>
            <div><b>GMT offset:</b> <span style={valueStyle}>{typeof TZ.gmt_offset === 'number' ? TZ.gmt_offset : '–'}</span></div>
            <div><b>DST:</b> <span style={valueStyle}>{typeof TZ.is_dst === 'boolean' ? (TZ.is_dst ? 'Yes' : 'No') : '–'}</span></div>
          </div>
        </div>
      )}

      {(CAR.name || CAR.mcc || CAR.mnc) && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Carrier</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 6 }}>
            <div><b>Name:</b> <span style={valueStyle}>{CAR.name || '–'}</span></div>
            <div><b>MCC/MNC:</b> <span style={valueStyle}>{[CAR.mcc, CAR.mnc].filter(Boolean).join('-') || '–'}</span></div>
          </div>
        </div>
      )}
    </div>
  )
}
