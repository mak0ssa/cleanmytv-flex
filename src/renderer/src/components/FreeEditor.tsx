import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { HomeConfig, HomeFree, TvApp } from '@shared/api'

// The launcher's free area, in dp. It sits in a list whose side padding is 34 dp on a 960 dp screen, so the
// canvas is 892 dp wide; a tile keeps 14 dp (BLEED) off each side so its glow isn't clipped. x and y are
// percent of the room a tile has left, which is why a tile never leaves the canvas at any size.
const CW = 892
const BLEED = 14
const SCREEN_H = 540

export function freeGeometry(cfg: Pick<HomeConfig, 'free_scale' | 'free_height' | 'show_names'>): { tileW: number; tileH: number; ch: number; rangeX: number; rangeY: number } {
  const tileW = (120 * cfg.free_scale) / 100
  const tileH = (tileW * 9) / 16 + (cfg.show_names ? 26 : 0)
  const ch = (SCREEN_H * cfg.free_height) / 100
  return { tileW, tileH, ch, rangeX: Math.max(0, CW - BLEED * 2 - tileW), rangeY: Math.max(0, ch - tileH) }
}

const clamp = (n: number): number => Math.min(100, Math.max(0, Math.round(n)))

/** Where a new app goes: the next free spot along a staggered diagonal, so tiles don't land on each other. */
export function nextSpot(placed: HomeFree[]): { x: number; y: number } {
  const n = placed.length
  return { x: clamp(6 + ((n * 17) % 80)), y: clamp(8 + ((n * 23) % 70)) }
}

/** Spreads the apps evenly over the canvas, six to a row at most. */
export function tidy(placed: HomeFree[]): HomeFree[] {
  const n = placed.length
  if (!n) return placed
  const cols = Math.min(n, 6)
  const rows = Math.ceil(n / cols)
  return placed.map((f, i) => ({
    pkg: f.pkg,
    x: cols === 1 ? 0 : clamp(((i % cols) * 100) / (cols - 1)),
    y: rows === 1 ? 0 : clamp((Math.floor(i / cols) * 100) / (rows - 1))
  }))
}

/**
 * A drag-and-drop picture of the free area: the same maths as the launcher, drawn at any width.
 * Arrow keys nudge the selected tile (Shift for bigger steps), so it works without a mouse too.
 */
export function FreeEditor(props: { apps: TvApp[]; cfg: HomeConfig; snap: boolean; onChange: (free: HomeFree[]) => void }): ReactNode {
  const { cfg, snap, onChange } = props
  const g = freeGeometry(cfg)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pkg: string; cx: number; cy: number; x: number; y: number } | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const label = new Map(props.apps.map((a) => [a.pkg, a.label]))

  const move = (pkg: string, x: number, y: number): void => {
    const step = snap ? 5 : 1
    const fix = (n: number): number => clamp(Math.round(n / step) * step)
    onChange(cfg.free.map((f) => (f.pkg === pkg ? { pkg, x: fix(x), y: fix(y) } : f)))
  }

  function down(e: PointerEvent<HTMLDivElement>, f: HomeFree): void {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { pkg: f.pkg, cx: e.clientX, cy: e.clientY, x: f.x, y: f.y }
    setSel(f.pkg)
  }
  function moveTo(e: PointerEvent<HTMLDivElement>): void {
    const d = drag.current
    const el = box.current
    if (!d || !el) return
    const scale = el.getBoundingClientRect().width / CW
    const dx = (e.clientX - d.cx) / scale
    const dy = (e.clientY - d.cy) / scale
    move(d.pkg, g.rangeX ? d.x + (dx / g.rangeX) * 100 : d.x, g.rangeY ? d.y + (dy / g.rangeY) * 100 : d.y)
  }
  function key(e: KeyboardEvent<HTMLDivElement>, f: HomeFree): void {
    const by = e.shiftKey ? 5 : 1
    const d: Record<string, [number, number]> = { ArrowLeft: [-by, 0], ArrowRight: [by, 0], ArrowUp: [0, -by], ArrowDown: [0, by] }
    const v = d[e.key]
    if (!v) return
    e.preventDefault()
    // A nudge is a whole step even with snap on.
    onChange(cfg.free.map((x) => (x.pkg === f.pkg ? { pkg: f.pkg, x: clamp(f.x + v[0]), y: clamp(f.y + v[1]) } : x)))
  }

  return (
    <div
      ref={box}
      className={`free-canvas${snap ? ' snap' : ''}`}
      style={{ aspectRatio: `${CW} / ${g.ch}` }}
      onPointerDown={(e) => e.target === e.currentTarget && setSel(null)}
      aria-label="Свободная область главного экрана"
    >
      {cfg.free.map((f) => (
        <div
          key={f.pkg}
          className={`free-tile${sel === f.pkg ? ' sel' : ''}`}
          tabIndex={0}
          role="button"
          aria-label={`${label.get(f.pkg) ?? f.pkg}: ${f.x} по горизонтали, ${f.y} по вертикали. Двигается стрелками.`}
          style={{
            left: `${((g.rangeX * f.x) / 100 + BLEED) / CW * 100}%`,
            top: `${((g.rangeY * f.y) / 100 / g.ch) * 100}%`,
            width: `${(g.tileW / CW) * 100}%`,
            height: `${(g.tileH / g.ch) * 100}%`
          }}
          onPointerDown={(e) => down(e, f)}
          onPointerMove={moveTo}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onFocus={() => setSel(f.pkg)}
          onKeyDown={(e) => key(e, f)}
        >
          <span className="free-art">{label.get(f.pkg) ?? f.pkg}</span>
        </div>
      ))}
      {!cfg.free.length && <span className="free-empty">Добавьте приложение ниже и перетащите его, куда нужно.</span>}
    </div>
  )
}
