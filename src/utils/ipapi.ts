import { getProxyOrigin } from './apiUtils'

export type IpapiPretty = {
  ip: string
  type?: string
  hostname?: string
  ip_routing_type?: string
  connection_type?: string
  location: {
    continent?: string
    continent_code?: string
    country?: string
    country_code?: string
    region?: string
    region_code?: string
    city?: string
    zip?: string
    lat?: number
    lon?: number
    capital?: string
    languages?: string[]
    is_eu?: boolean
    geoname_id?: number
    country_flag?: string
    flag_emoji?: string
    calling_code?: string
    time_zone?: string
    isp?: string
    org?: string
    asn?: string
    proxy?: boolean
    hosting?: boolean
  }
  time_zone?: {
    id?: string
    code?: string
    current_time?: string
    gmt_offset?: number
    is_dst?: boolean
  }
  connection?: {
    ip?: string
    type?: string
    isp?: string
    org?: string
    asn?: string
  }
  carrier?: {
    name?: string
    mcc?: string
    mnc?: string
  }
}

const KEY = (ip: string) => `ipapi:${ip}`

export async function fetchIpapi(ip: string, proxyBase = ""): Promise<IpapiPretty> {
  const k = KEY(ip)
  const cached = sessionStorage.getItem(k)
  if (cached) {
    try { return JSON.parse(cached) } catch {}
  }

  const base = proxyBase && proxyBase.trim().length > 0 ? proxyBase : getProxyOrigin()
  const url = new URL('/proxy/ipapi/lookup', base)
  url.searchParams.set('ip', ip)

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' }, credentials: 'include' })
  if (res.status === 501) {
    throw new Error('IP lookup is disabled (no API key configured).')
  }
  if (!res.ok) {
    let msg = 'Unknown error'
    try { msg = await res.text() } catch {}
    throw new Error(msg || `Lookup failed (${res.status})`)
  }
  const data = (await res.json()) as IpapiPretty
  try { sessionStorage.setItem(k, JSON.stringify(data)) } catch {}
  return data
}
