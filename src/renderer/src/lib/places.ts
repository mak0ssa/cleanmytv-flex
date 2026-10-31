// Place search for the weather widget: Open-Meteo's geocoding, through the main process (the page's CSP
// blocks the network). The TV then asks Open-Meteo for the weather at the chosen coordinates.

export interface Place {
  name: string
  /** Region and country, for telling two Springfields apart. */
  detail: string
  lat: number
  lon: number
}

/** Reads Yandex.Pogoda's page for a place the way the TV does: the sentence with the weather in it. */
async function yandexTemp(lat: number, lon: number): Promise<number> {
  const r = await window.cytv.webGet(`https://yandex.ru/pogoda/ru/yekaterinburg?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`)
  if (r.status !== 200) throw new Error(`Яндекс ответил кодом ${r.status}.`)
  const bin = atob(r.base64)
  const html = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
  const text = (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').replace(/[\u200B-\u200F\u2060\uFEFF\u00A0]/g, ' ').replace(/\u2212/g, '-').replace(/\s+/g, ' ')
  const m = /Температура воздуха\s*([+-]?\d+)\s*°/.exec(text)
  if (!m) throw new Error(/captcha/i.test(html) ? 'Яндекс просит ввести капчу.' : 'В странице Яндекса не нашлось температуры.')
  return Number(m[1])
}

/** Asks the weather source for the current temperature at a place, from this computer: proves the place and the source work. */
export async function checkWeather(lat: number, lon: number, source: 'yandex' | 'openmeteo' = 'yandex'): Promise<{ temp: number; source: string }> {
  const order = source === 'openmeteo' ? (['openmeteo', 'yandex'] as const) : (['yandex', 'openmeteo'] as const)
  const reasons: string[] = []
  for (const s of order) {
    try {
      return s === 'yandex' ? { temp: await yandexTemp(lat, lon), source: 'Яндекс.Погода' } : { temp: await openMeteoTemp(lat, lon), source: 'Open-Meteo' }
    } catch (e) {
      reasons.push(`${s === 'yandex' ? 'Яндекс' : 'Open-Meteo'}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  throw new Error(reasons.join(' '))
}

async function openMeteoTemp(lat: number, lon: number): Promise<number> {
  const r = await window.cytv.webGet(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m`)
  if (r.status !== 200) throw new Error(`Сервер погоды ответил кодом ${r.status}.`)
  const bin = atob(r.base64)
  const text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
  const t = (JSON.parse(text) as { current?: { temperature_2m?: unknown } }).current?.temperature_2m
  if (typeof t !== 'number') throw new Error('Сервер погоды не прислал температуру.')
  return Math.round(t)
}

export async function findPlaces(query: string): Promise<Place[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const r = await window.cytv.webGet(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=ru&format=json`)
  if (r.status !== 200) throw new Error(`Поиск места ответил кодом ${r.status}. Попробуйте через минуту.`)
  const bin = atob(r.base64)
  const text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
  const results = (JSON.parse(text) as { results?: Record<string, unknown>[] }).results ?? []
  return results.flatMap((p) => {
    if (typeof p.name !== 'string' || typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return []
    const detail = [p.admin1, p.country].filter((x): x is string => typeof x === 'string' && x !== p.name).join(', ')
    return [{ name: p.name.slice(0, 40), detail, lat: p.latitude, lon: p.longitude }]
  })
}
