import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { HomeConfig, QuickId, TvApp } from '@shared/api'

// The launcher lays out in dp on a 960x540 screen; the preview draws at that size and scales to fit.
const W = 960
const H = 540
const SAFE_X = 48
const SAFE_Y = 27
const BLEED_PX = 14
const GAP = 16

const QUICK_GLYPH: Record<QuickId, string> = {
  inputs: 'M4 7h12v10H4zM16 10h4M16 14h4',
  wifi: 'M4 9a12 12 0 0 1 16 0M7 12.5a7.5 7.5 0 0 1 10 0M10 16a3 3 0 0 1 4 0',
  bluetooth: 'M8 7l8 8-4 3V6l4 3-8 8',
  display: 'M4 6h16v10H4zM9 20h6',
  apps: 'M5 5h4v4H5zM15 5h4v4h-4zM5 15h4v4H5zM15 15h4v4h-4z',
  tune: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6',
  drawer: 'M5 5h3v3H5zM10.5 5h3v3h-3zM16 5h3v3h-3zM5 10.5h3v3H5zM10.5 10.5h3v3h-3zM16 10.5h3v3h-3zM5 16h3v3H5zM10.5 16h3v3h-3zM16 16h3v3h-3z',
  sleep: 'M17 14A7 7 0 0 1 10 5a7 7 0 1 0 7 9z',
  search: 'M11 5a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM16 16l4 4',
  music: 'M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  settings: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1'
}

export const QUICK_LABEL: Record<QuickId, string> = {
  inputs: 'Входы', wifi: 'Wi-Fi', bluetooth: 'Bluetooth', display: 'Изображение и звук', apps: 'Приложения', sleep: 'Заставка', search: 'Поиск', music: 'Музыкальные полосы', drawer: 'Все приложения', tune: 'Настройки главного экрана', settings: 'Настройки'
}

export function QuickIcon({ id, size = 16 }: { id: QuickId; size?: number }): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={QUICK_GLYPH[id]} />
    </svg>
  )
}

/** The order and grouping the launcher uses, from the same settings. */
function model(apps: TvApp[], cfg: HomeConfig) {
  const by = new Map(apps.map((a) => [a.pkg, a]))
  const ordered = [...cfg.order.flatMap((p) => (by.has(p) ? [by.get(p)!] : [])), ...apps.filter((a) => !cfg.order.includes(a.pkg)).sort((a, b) => a.label.localeCompare(b.label))].filter(
    (a) => !cfg.hidden.includes(a.pkg)
  )
  const inFolders = new Set(cfg.folders.flatMap((f) => f.apps))
  // Freely placed apps leave the dock and the grid, but only while the free section is on.
  const free = cfg.sections.includes('free') || cfg.layout === 'free' ? cfg.free.flatMap((f) => (by.has(f.pkg) && !cfg.hidden.includes(f.pkg) ? [{ app: by.get(f.pkg)!, x: f.x, y: f.y }] : [])) : []
  const inFree = new Set(free.map((f) => f.app.pkg))
  const dock = ordered.filter((a) => !inFolders.has(a.pkg) && !inFree.has(a.pkg)).slice(0, cfg.dock_size)
  const grid = ordered.filter((a) => !inFolders.has(a.pkg) && !inFree.has(a.pkg) && !dock.includes(a))
  const rows = cfg.rows.map((r) => ({ name: r.name, apps: r.apps.flatMap((p) => (by.has(p) ? [by.get(p)!] : [])) })).filter((r) => r.apps.length)
  const folders = cfg.folders.map((f) => ({ name: f.name, apps: f.apps.flatMap((p) => (by.has(p) ? [by.get(p)!] : [])) })).filter((f) => f.apps.length)
  return { dock, grid, rows, folders, free }
}

function Tile({ app, w, names, focused, cfg }: { app: TvApp; w: number; names: boolean; focused?: boolean; cfg: HomeConfig }): ReactNode {
  const ring: CSSProperties = focused
    ? cfg.focus === 'glow'
      ? { boxShadow: `0 0 0 2px #F0EBE5, 0 0 16px 4px ${cfg.accent}`, transform: 'scale(1.08)' }
      : cfg.focus === 'outline'
        ? { outline: `3px solid ${cfg.accent}`, outlineOffset: 0, transform: 'scale(1.08)' }
        : {}
    : {}
  return (
    <div style={{ width: w, flex: 'none' }}>
      <div style={{ height: (w * 9) / 16, borderRadius: 10, background: '#2D3A2E', display: 'grid', placeItems: 'center', color: '#F0EBE5', fontWeight: 500, fontSize: Math.max(12, w / 11), padding: '0 8px', textAlign: 'center', lineHeight: 1.15, overflow: 'hidden', ...ring }}>
        {app.label}
      </div>
      {names && <div style={{ marginTop: 6, fontSize: 14, color: '#F0EBE5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.label}</div>}
    </div>
  )
}

function Folder({ name, apps, w }: { name: string; apps: TvApp[]; w: number }): ReactNode {
  return (
    <div style={{ width: w, flex: 'none' }}>
      <div style={{ height: (w * 9) / 16, borderRadius: 10, background: 'rgba(45,58,46,0.9)', padding: 7, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
        {apps.slice(0, 4).map((a) => (
          <div key={a.pkg} style={{ borderRadius: 4, background: '#3A4A3B' }} />
        ))}
      </div>
      <div style={{ marginTop: 6, fontSize: 14, color: '#F0EBE5' }}>
        {name} · {apps.length}
      </div>
    </div>
  )
}

function Title({ children }: { children: ReactNode }): ReactNode {
  return <div style={{ fontSize: 18, color: '#F0EBE5', fontWeight: 500, margin: '12px 0 4px' }}>{children}</div>
}

function Sections({ apps, cfg, width, dockW, showFolders = true }: { apps: TvApp[]; cfg: HomeConfig; width: number; dockW: number; showFolders?: boolean }): ReactNode {
  const m = model(apps, cfg)
  const gridW = (width - GAP * (cfg.columns - 1)) / cfg.columns
  const rowW = 148 * (cfg.tile_scale / 100)
  let focused = false
  const focusOnce = (): boolean => (focused ? false : (focused = true))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {cfg.sections.map((s) => {
        // A stand-in: on the TV the card shows only while an app has something playing.
        if (s === 'nowplaying')
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 14, width: 520, padding: 12, margin: '8px 0', borderRadius: 14, background: 'rgba(45,58,46,0.88)' }}>
              <div style={{ width: 64, height: 64, borderRadius: 8, background: '#3A4A3B', flex: 'none' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 500 }}>Что играет</div>
                <div style={{ fontSize: 13, color: '#D7CFC4', marginTop: 3 }}>Исполнитель · Приложение, пока что-то играет</div>
              </div>
              {['❚❚', '▸▸'].map((g) => (
                <div key={g} style={{ width: 44, height: 44, borderRadius: 22, background: 'rgba(255,255,255,0.08)', display: 'grid', placeItems: 'center', fontSize: 13 }}>{g}</div>
              ))}
            </div>
          )
        if (s === 'dock' && m.dock.length)
          return (
            <div key={s} style={{ display: 'flex', gap: GAP, padding: '8px 0' }}>
              {m.dock.map((a, i) => <Tile key={a.pkg} app={a} w={dockW * (cfg.dock_scale / 100)} names={cfg.show_names} focused={i === 0 && focusOnce()} cfg={cfg} />)}
            </div>
          )
        if (s === 'rows')
          return m.rows.map((r, ri) => (
            <div key={`row${ri}`}>
              <Title>{r.name}</Title>
              <div style={{ display: 'flex', gap: GAP, padding: '6px 0' }}>
                {r.apps.map((a, i) => <Tile key={a.pkg} app={a} w={rowW} names={cfg.show_names} focused={ri === 0 && i === 0 && focusOnce()} cfg={cfg} />)}
              </div>
            </div>
          ))
        if (s === 'folders' && showFolders && m.folders.length)
          return (
            <div key={s}>
              <Title>Папки</Title>
              <div style={{ display: 'flex', gap: GAP, padding: '6px 0' }}>
                {m.folders.map((f) => <Folder key={f.name} name={f.name} apps={f.apps} w={rowW} />)}
              </div>
            </div>
          )
        if (s === 'free' && m.free.length) {
          const tileW = (120 * cfg.free_scale) / 100
          const tileH = (tileW * 9) / 16 + (cfg.show_names ? 26 : 0)
          const ch = (H * cfg.free_height) / 100
          return (
            <div key={s} style={{ position: 'relative', height: ch, width }}>
              {m.free.map((f) => (
                <div key={f.app.pkg} style={{ position: 'absolute', left: (Math.max(0, width - tileW) * f.x) / 100, top: (Math.max(0, ch - tileH) * f.y) / 100 }}>
                  <Tile app={f.app} w={tileW} names={cfg.show_names} cfg={cfg} />
                </div>
              ))}
            </div>
          )
        }
        if (s === 'grid' && !cfg.drawer_on && m.grid.length)
          return (
            <div key={s}>
              <Title>{m.dock.length || m.rows.length ? 'Все приложения' : 'Приложения'}</Title>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cfg.columns}, ${gridW}px)`, gap: `14px ${GAP}px`, padding: '6px 0' }}>
                {m.grid.map((a, i) => <Tile key={a.pkg} app={a} w={gridW} names={cfg.show_names} focused={i === 0 && focusOnce()} cfg={cfg} />)}
              </div>
            </div>
          )
        return null
      })}
    </div>
  )
}

function Clock({ cfg, size, dateSize, align }: { cfg: HomeConfig; size: number; dateSize: number; align: 'left' | 'right' | 'center' }): ReactNode {
  if (cfg.clock === 'off') return null
  const k = cfg.clock_scale / 100
  return (
    <div style={{ textAlign: align }}>
      <div style={{ fontSize: size * k, fontWeight: 300, lineHeight: 1.1, fontFamily: 'var(--font)' }}>9:41</div>
      {cfg.clock === 'time_date' && <div style={{ fontSize: dateSize * k, color: '#D7CFC4', fontFamily: 'var(--font)' }}>среда, 28 октября</div>}
      {cfg.weather_place && (
        <div style={{ fontSize: dateSize, color: '#D7CFC4', fontFamily: 'var(--font)', marginTop: 4 }}>
          ☁ 14°  16° / 9°  {cfg.weather_place}
        </div>
      )}
    </div>
  )
}

const greetingText = (cfg: HomeConfig): string | null => (cfg.greeting.trim() ? `Добрый вечер, ${cfg.greeting.trim()}` : null)

/**
 * A picture of the TV's home screen from the same settings the launcher reads: layout, sections, sizes
 * and colours. App art is a coloured monogram, since the desktop app can't read the TV's banners.
 */
export function HomePreview({ apps, cfg }: { apps: TvApp[]; cfg: HomeConfig }): ReactNode {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(el.clientWidth / W))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const greet = greetingText(cfg)
  // As on the TV: icons it can't open are left out.
  const quick = cfg.quick.filter((q) => !cfg.quick_available || cfg.quick_available.includes(q))
  const ground: CSSProperties = {
    background: cfg.has_wallpaper
      ? `linear-gradient(rgba(0,0,0,${cfg.wallpaper_dim / 100}), rgba(0,0,0,${cfg.wallpaper_dim / 100})), linear-gradient(160deg, #6b5a3e, #2f3b2a 55%, #1a2418)`
      : cfg.background
  }
  const quickRow = (gap: number): ReactNode =>
    quick.length > 0 && (
      <div style={{ display: 'flex', gap }}>
        {quick.map((q) => (
          <span key={q} style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(255,255,255,0.08)', display: 'grid', placeItems: 'center' }}>
            <QuickIcon id={q} size={20} />
          </span>
        ))}
      </div>
    )
  let body: ReactNode
  if (cfg.layout === 'free') {
    const m = model(apps, cfg)
    const tileW = (120 * cfg.free_scale) / 100
    const tileH = (tileW * 9) / 16 + (cfg.show_names ? 26 : 0)
    const cw = W - SAFE_X * 2 + BLEED_PX * 2
    const ch = H - SAFE_Y * 2
    body = (
      <div style={{ height: '100%', position: 'relative' }}>
        <div style={{ position: 'absolute', left: SAFE_X - BLEED_PX, top: SAFE_Y, width: cw, height: ch }}>
          {m.free.map((f) => (
            <div key={f.app.pkg} style={{ position: 'absolute', left: (Math.max(0, cw - BLEED_PX * 2 - tileW) * f.x) / 100 + BLEED_PX, top: (Math.max(0, ch - tileH) * f.y) / 100 }}>
              <Tile app={f.app} w={tileW} names={cfg.show_names} cfg={cfg} />
            </div>
          ))}
          {m.free.length === 0 && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#D7CFC4', fontSize: 16 }}>Свободная область пуста</div>}
        </div>
        <div style={{ position: 'absolute', right: SAFE_X, top: SAFE_Y }}>
          <Clock cfg={cfg} size={26} dateSize={12} align="right" />
        </div>
        {greet && <div style={{ position: 'absolute', left: SAFE_X, top: SAFE_Y + 4, fontSize: 20, fontWeight: 500 }}>{greet}</div>}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: SAFE_Y, display: 'flex', justifyContent: 'center' }}>{quickRow(10)}</div>
      </div>
    )
  } else if (cfg.layout === 'mirror') {
    body = (
      <div style={{ display: 'flex', height: '100%', background: 'linear-gradient(90deg, transparent 60%, rgba(28,42,31,0.7))' }}>
        <div style={{ flex: 0.68, padding: `${SAFE_Y + 12}px 0 0 ${SAFE_X}px`, overflow: 'hidden' }}>
          <Sections apps={apps} cfg={cfg} width={W * 0.68 - SAFE_X} dockW={168} />
        </div>
        <div style={{ flex: 0.32, padding: `${SAFE_Y + 24}px ${SAFE_X}px ${SAFE_Y + 48}px 0`, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 14 }}>
          <Clock cfg={cfg} size={46} dateSize={15} align="right" />
          {greet && <div style={{ fontSize: 18, fontWeight: 500 }}>{greet}</div>}
          <div style={{ flex: 1 }} />
          {quick.map((q) => (
            <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15 }}>
              {QUICK_LABEL[q]} <QuickIcon id={q} size={20} />
            </div>
          ))}
        </div>
      </div>
    )
  } else if (cfg.layout === 'center') {
    body = (
      <div style={{ height: '100%', padding: `${SAFE_Y}px ${SAFE_X}px 0`, overflow: 'hidden', background: 'linear-gradient(rgba(28,42,31,0.6), transparent 230px)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          {greet && <div style={{ fontSize: 20, fontWeight: 500 }}>{greet}</div>}
          <Clock cfg={cfg} size={40} dateSize={14} align="center" />
          <div style={{ marginTop: 6 }}>{quickRow(10)}</div>
        </div>
        <div style={{ height: (H * cfg.top_space) / 100 }} />
        <Sections apps={apps} cfg={cfg} width={W - SAFE_X * 2} dockW={200} />
      </div>
    )
  } else if (cfg.layout === 'bottom') {
    body = (
      <div style={{ height: '100%', position: 'relative' }}>
        <div style={{ padding: `${SAFE_Y + 8}px ${SAFE_X}px 0`, overflow: 'hidden', height: '100%' }}>
          <Sections apps={apps} cfg={cfg} width={W - SAFE_X * 2} dockW={200} />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `28px ${SAFE_X}px ${SAFE_Y}px`, display: 'flex', alignItems: 'center', gap: 24, background: 'linear-gradient(transparent, rgba(28,42,31,0.9))' }}>
          <Clock cfg={cfg} size={30} dateSize={12} align="left" />
          <div style={{ flex: 1 }} />
          {greet && <div style={{ fontSize: 16, fontWeight: 500 }}>{greet}</div>}
          {quickRow(10)}
        </div>
      </div>
    )
  } else if (cfg.layout === 'split') {
    body = (
      <div style={{ display: 'flex', height: '100%', background: 'linear-gradient(90deg, rgba(28,42,31,0.7), transparent 60%)' }}>
        <div style={{ width: W * 0.32, padding: `${SAFE_Y + 24}px 0 ${SAFE_Y + 48}px ${SAFE_X}px`, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Clock cfg={cfg} size={56} dateSize={15} align="left" />
          {greet && <div style={{ fontSize: 18, fontWeight: 500 }}>{greet}</div>}
          <div style={{ flex: 1 }} />
          {quick.map((q) => (
            <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15 }}>
              <QuickIcon id={q} size={20} /> {QUICK_LABEL[q]}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, padding: `${SAFE_Y + 12}px ${SAFE_X}px 0 0`, overflow: 'hidden' }}>
          <Sections apps={apps} cfg={cfg} width={W * 0.68 - SAFE_X} dockW={168} />
        </div>
      </div>
    )
  } else if (cfg.layout === 'rail') {
    body = (
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{ width: SAFE_X + 56, padding: `${SAFE_Y + 8}px 0 0 ${SAFE_X + 7}px`, display: 'flex', flexDirection: 'column', gap: 18, background: 'linear-gradient(90deg, rgba(28,42,31,0.6), rgba(28,42,31,0.1))' }}>
          {quick.map((q) => <QuickIcon key={q} id={q} size={22} />)}
          {cfg.folders.length > 0 && <div style={{ height: 6 }} />}
          {cfg.folders.map((f) => (
            <svg key={f.name} viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M3 7h6l2 2h10v10H3z" />
            </svg>
          ))}
        </div>
        <div style={{ flex: 1, padding: `${SAFE_Y}px ${SAFE_X}px 0 24px`, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 500, flex: 1 }}>{greet}</div>
            <Clock cfg={cfg} size={26} dateSize={12} align="right" />
          </div>
          <Sections apps={apps} cfg={cfg} width={W - SAFE_X - 56 - 24 - SAFE_X} dockW={196} showFolders={false} />
        </div>
      </div>
    )
  } else {
    body = (
      <div style={{ height: '100%', padding: `${SAFE_Y}px ${SAFE_X}px 0`, overflow: 'hidden', background: 'linear-gradient(rgba(28,42,31,0.6), transparent 210px)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 20, fontWeight: 500, flex: 1, paddingTop: 4 }}>{greet}</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
            <Clock cfg={cfg} size={26} dateSize={12} align="right" />
            {quick.length > 0 && (
              <div style={{ display: 'flex', gap: 10 }}>
                {quick.map((q) => (
                  <span key={q} style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(255,255,255,0.08)', display: 'grid', placeItems: 'center' }}>
                    <QuickIcon id={q} size={20} />
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ height: (H * cfg.top_space) / 100 }} />
        <Sections apps={apps} cfg={cfg} width={W - SAFE_X * 2} dockW={200} />
      </div>
    )
  }
  return (
    <div ref={box} className="home-preview" style={{ height: H * scale }} aria-label="Предпросмотр главного экрана ТВ">
      <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: '0 0', color: '#F0EBE5', fontFamily: 'Roboto, system-ui, sans-serif', ...ground }}>{body}</div>
      {cfg.drawer_on && cfg.drawer_pill && (
        <span style={{ position: 'absolute', left: '50%', bottom: '5%', transform: 'translateX(-50%)', padding: '3px 12px', borderRadius: 99, background: 'rgba(28,42,31,0.8)', color: '#F0EBE5', fontSize: 11 }}>▦ Все приложения</span>
      )}
      <span className="home-preview-note">Время и приветствие условные · значки приложений видны на ТВ</span>
    </div>
  )
}
