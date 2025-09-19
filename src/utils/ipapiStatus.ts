import { getProxyOrigin } from './apiUtils'

export async function fetchIpapiStatus(): Promise<boolean> {
  try {
    const url = new URL('/proxy/ipapi/status', getProxyOrigin()).toString()
    const res = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'include' })
    if (!res.ok) return false
    const data = await res.json()
    return Boolean(data?.enabled)
  } catch {
    return false
  }
}
