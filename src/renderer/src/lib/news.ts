// Headlines for the news widget, read the same way the TV reads them, so "Проверить новости" shows what the TV will show:
// a feed (RSS or Atom) as a feed, any other page by the links of the e1.ru article pattern, in page order.

export interface Headline {
  title: string
  url: string
}

const ARTICLE = /<a\s[^>]*?href="([^"]*?\/text\/[a-z0-9-]+\/\d{4}\/\d{2}\/\d{2}\/\d+\/?[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
const RSS_ITEM = /<item[\s>][\s\S]*?<title[^>]*>([\s\S]*?)<\/title>[\s\S]*?<link[^>]*>([\s\S]*?)<\/link>/gi
const ATOM_ENTRY = /<entry[\s>][\s\S]*?<title[^>]*>([\s\S]*?)<\/title>[\s\S]*?<link[^>]*?href="([^"]*)"/gi

function clean(s: string): string {
  const noTags = s.replace('<![CDATA[', '').replace(']]>', '').replace(/<[^>]*>/g, ' ')
  const text = new DOMParser().parseFromString(noTags, 'text/html').documentElement.textContent ?? ''
  return text.replace(/\s+/g, ' ').trim()
}

export function extractHeadlines(text: string, base: string, max = 8): Headline[] {
  const pairs: [string, string][] = []
  const rx = text.includes('<rss') || text.includes('<channel') ? RSS_ITEM : text.includes('<feed') ? ATOM_ENTRY : ARTICLE
  const feed = rx !== ARTICLE
  for (const m of text.matchAll(rx)) pairs.push(feed ? [m[1], m[2]] : [m[2], m[1]])
  const urls = new Set<string>()
  const titles = new Set<string>()
  const out: Headline[] = []
  for (const [rawTitle, rawUrl] of pairs) {
    const title = clean(rawTitle)
    let url: string
    try {
      url = new URL(clean(rawUrl), base).toString()
    } catch {
      continue
    }
    if (!url.startsWith('https://') || title.length < 20 || title.length > 240 || title.startsWith('http')) continue
    const key = url.split('?')[0]
    if (urls.has(key) || titles.has(title)) continue
    urls.add(key)
    titles.add(title)
    out.push({ title, url })
    if (out.length >= max) break
  }
  return out
}

/** Downloads the page from this computer (only hosts the app allows) and reads its headlines. */
export async function checkNews(url: string): Promise<Headline[]> {
  const r = await window.cytv.webGet(url)
  if (r.status !== 200) throw new Error(`Сайт ответил кодом ${r.status}.`)
  const bin = atob(r.base64)
  const text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
  const found = extractHeadlines(text, url, 5)
  if (found.length === 0) throw new Error('Страница открылась, но заголовков в ней не нашлось. Для сайтов, кроме e1.ru, укажите адрес RSS-ленты.')
  return found
}
