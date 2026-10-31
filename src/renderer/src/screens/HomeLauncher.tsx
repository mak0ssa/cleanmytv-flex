import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AnimStyle, ApplyResult, ButtonAction, DrawerStyle, HomeButton, HomeConfig, HomeFree, HomeGroup, HomeLayout, HomeSection, HomeStatus, KeyPress, QuickId, TvApp } from '@shared/api'
import type { ScreenProps } from '../App'
import { AppOrder } from '../components/AppOrder'
import { FreeEditor, nextSpot, tidy } from '../components/FreeEditor'
import { HomePreview, QUICK_LABEL, QuickIcon } from '../components/HomePreview'
import { Busy, Confirm, ResultNotice, Slider, StatusChip, Toggle, errorText } from '../components/ui'
import { prepareWallpaper, thumbnail } from '../lib/image'
import { fetchBingDaily } from '../lib/backgrounds'
import { checkWeather, findPlaces, type Place } from '../lib/places'
import { checkNews, type Headline } from '../lib/news'

type Tab = 'overview' | 'apps' | 'layout' | 'place' | 'look' | 'widgets' | 'music' | 'buttons'

const TABS: [Tab, string][] = [
  ['overview', 'Обзор'],
  ['layout', 'Макет'],
  ['place', 'Расстановка и меню'],
  ['apps', 'Приложения, ряды и папки'],
  ['look', 'Оформление и обои'],
  ['widgets', 'Виджеты'],
  ['music', 'Музыкальные полосы'],
  ['buttons', 'Кнопки пульта']
]

const ACCENTS = ['#FF3000', '#2EC4B6', '#FFB23C', '#7C5CFF', '#3DDC84', '#FFFFFF']

/** The TV has an older CleanMyTV Home than this app carries. */
const outdated = (h: HomeStatus): boolean => h.installed && !!h.bundledVersion && h.versionName !== h.bundledVersion

type SetFn = (change: Partial<HomeConfig>, wait?: number) => void

/**
 * Everything for CleanMyTV Home. Each change is sent to the TV as soon as it's made (sliders and typing
 * wait until they settle), and the launcher redraws at once: there's no Apply button.
 */
export function HomeLauncher({ markDone, refreshTvs, status }: ScreenProps): ReactNode {
  const [home, setHome] = useState<HomeStatus | null>(null)
  const [cfg, setCfg] = useState<HomeConfig | null>(null)
  const [apps, setApps] = useState<TvApp[] | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [askStock, setAskStock] = useState(false)
  const pending = useRef<Partial<HomeConfig>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function load(): Promise<void> {
    try {
      const h = await window.cytv.homeStatus()
      setHome(h)
      setCfg(null)
      // An older launcher on the TV doesn't know the newer settings; the page waits for Update.
      if (h.installed && !outdated(h)) {
        // The launcher's own list: the apps it shows, with the names the TV uses.
        const [c, a] = await Promise.all([window.cytv.readHomeConfig(), window.cytv.homeApps()])
        setCfg(c)
        setApps(a)
      }
    } catch (e) {
      setResult({ ok: false, summary: errorText(e), warnings: [] })
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function flush(): Promise<void> {
    const change = { ...pending.current }
    pending.current = {}
    if (!Object.keys(change).length) return
    // A row or folder being renamed can be blank for a moment; the TV only gets named ones.
    for (const k of ['rows', 'folders'] as const) if (change[k]) change[k] = change[k].filter((g) => g.name.trim())
    setSaving(true)
    try {
      const back = await window.cytv.setHomeConfig(change)
      setCfg((prev) => (prev ? { ...back, rows: prev.rows, folders: prev.folders, order: prev.order, greeting: prev.greeting, free: prev.free } : back))
      markDone('home')
    } catch (e) {
      setResult({ ok: false, summary: errorText(e), warnings: [] })
    } finally {
      setSaving(false)
    }
  }

  // Shown here at once, sent once the control settles.
  const set: SetFn = (change, wait = 150) => {
    setCfg((prev) => (prev ? { ...prev, ...change } : prev))
    pending.current = { ...pending.current, ...change }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, wait)
  }

  async function run(label: string, fn: () => Promise<ApplyResult>): Promise<void> {
    setBusy(label)
    setResult(null)
    try {
      const r = await fn()
      setResult(r)
      if (r.ok) markDone('home')
    } catch (e) {
      setResult({ ok: false, summary: errorText(e), warnings: [] })
    } finally {
      setBusy(null)
      load()
    }
  }

  async function wallpaper(label: string, get: () => Promise<string | null>): Promise<void> {
    setBusy(label)
    setResult(null)
    try {
      const jpeg = await get()
      setCfg(await window.cytv.setHomeWallpaper(jpeg))
      markDone('home')
    } catch (e) {
      setResult({ ok: false, summary: errorText(e), warnings: [] })
    } finally {
      setBusy(null)
    }
  }

  const ready = !!home?.installed && !outdated(home) && !!cfg

  return (
    <>
      <h1>Главный экран</h1>
      <p className="lede">
        CleanMyTV Home — новый главный экран телевизора: без рекламы, с вашими приложениями и вашей раскладкой. Установите его один раз и меняйте здесь что угодно;
        телевизор показывает изменения сразу и помнит их после перезагрузки. Вернуть штатный лаунчер можно в один клик на вкладке «Обзор».
      </p>
      <ResultNotice result={result} onDismiss={() => setResult(null)} />
      {busy && (
        <div className="notice">
          <Busy text={busy} />
        </div>
      )}

      {!home ? (
        <Busy text="Спрашиваю телевизор о CleanMyTV Home" />
      ) : (
        <>
          <div className="tabs" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} disabled={id !== 'overview' && !ready} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {outdated(home) && (
            <div className="notice warn">
              На телевизоре CleanMyTV Home {home.versionName}, а в этой программе — {home.bundledVersion}. Нажмите «Обновить и использовать», чтобы менять его
              макет, приложения и оформление отсюда.
            </div>
          )}
          {tab === 'overview' && (
            <Overview home={home} busy={!!busy} run={run} askStock={() => setAskStock(true)} host={status.host} onShot={refreshTvs} />
          )}
          {ready && tab === 'apps' && apps && <AppsTab apps={apps} cfg={cfg} set={set} />}
          {ready && tab === 'layout' && apps && <LayoutTab apps={apps} cfg={cfg} set={set} />}
          {ready && tab === 'place' && apps && <PlaceTab apps={apps} cfg={cfg} set={set} />}
          {ready && tab === 'look' && <LookTab cfg={cfg} set={set} busy={!!busy} wallpaper={wallpaper} />}
          {ready && tab === 'widgets' && <WidgetsTab cfg={cfg} set={set} />}
          {ready && tab === 'music' && <MusicTab cfg={cfg} set={set} />}
          {ready && tab === 'buttons' && apps && <ButtonsTab cfg={cfg} set={set} apps={apps} setCfg={setCfg} onError={(e) => setResult({ ok: false, summary: errorText(e), warnings: [] })} />}
          {ready && tab !== 'overview' && <p className="small muted">{saving ? 'Отправляю на телевизор…' : 'Сохранено на телевизоре.'}</p>}
        </>
      )}

      {askStock && (
        <Confirm
          title="Вернуть штатный лаунчер?"
          confirmLabel="Вернуть"
          onConfirm={() => {
            setAskStock(false)
            run('Возвращаю главный экран штатному лаунчеру', () => window.cytv.useStockLauncher())
          }}
          onCancel={() => setAskStock(false)}
        >
          <p>Программа снова включит штатный лаунчер телевизора и сделает его главным. CleanMyTV Home останется установленным, и переключиться обратно можно будет в любой момент.</p>
        </Confirm>
      )}
    </>
  )
}

function Overview(props: { home: HomeStatus; busy: boolean; run: (label: string, fn: () => Promise<ApplyResult>) => Promise<void>; askStock: () => void; host?: string; onShot: () => void }): ReactNode {
  const { home, busy, run } = props
  const [shot, setShot] = useState<string | null>(null)
  const [shooting, setShooting] = useState(false)
  const [shotError, setShotError] = useState<string | null>(null)

  async function snapshot(): Promise<void> {
    setShooting(true)
    setShotError(null)
    try {
      const s = await window.cytv.screenshot()
      setShot(s)
      if (props.host) {
        await window.cytv.saveTvThumb(props.host, await thumbnail(s))
        props.onShot()
      }
    } catch (e) {
      setShot(null)
      setShotError(errorText(e))
    } finally {
      setShooting(false)
    }
  }

  return (
    <>
      <div className="card white">
        <div className="card-head">
          <h2>На этом телевизоре</h2>
          <StatusChip status={home.isHome ? 'ok' : home.installed ? 'warn' : 'optional'} text={home.isHome ? 'Главный экран' : home.installed ? 'Установлен, не главный' : 'Не установлен'} />
        </div>
        <div className="facts">
          <div>
            <span>На телевизоре</span>
            <b>{home.installed ? `версия ${home.versionName ?? '?'}` : 'не установлен'}</b>
          </div>
          <div>
            <span>В этой программе</span>
            <b>{home.bundled ? `версия ${home.bundledVersion ?? '?'}` : 'нет встроенной копии'}</b>
          </div>
        </div>
        {home.unsupported && (
          <div className="notice warn" style={{ marginTop: 16, marginBottom: 0 }}>
            {home.unsupported}
          </div>
        )}
        <div className="row" style={{ marginTop: 16 }}>
          {(!home.installed || outdated(home)) && (
            <button className="btn primary" disabled={busy || !home.bundled || !!home.unsupported} onClick={() => run('Устанавливаю CleanMyTV Home. Не выключайте телевизор.', () => window.cytv.installHome())}>
              {home.installed ? 'Обновить и использовать' : 'Установить и использовать'}
            </button>
          )}
          {home.installed && !home.isHome && (
            <button className="btn primary" disabled={busy} onClick={() => run('Переключаю главный экран на CleanMyTV Home', () => window.cytv.useHome())}>
              Использовать CleanMyTV Home
            </button>
          )}
          {home.isHome && (
            <button className="btn" disabled={busy} onClick={props.askStock}>
              Вернуть штатный лаунчер
            </button>
          )}
        </div>
        {home.oldLauncher && (
          <div className="notice" style={{ marginTop: 16, marginBottom: 0 }}>
            <p style={{ margin: '0 0 10px' }}>
              Лаунчер CleanYourTV из прежних версий программы всё ещё на телевизоре. CleanMyTV Home его заменяет.
              {!home.isHome && ' Сначала установите CleanMyTV Home или переключитесь на него.'}
            </p>
            <button className="btn small" disabled={busy || !home.isHome} onClick={() => run('Удаляю лаунчер CleanYourTV', () => window.cytv.removeOldLauncher())}>
              Удалить лаунчер CleanYourTV
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Что показывает телевизор</h2>
          <button className="btn small" onClick={snapshot} disabled={shooting}>
            {shooting ? 'Делаю снимок…' : 'Сделать снимок'}
          </button>
        </div>
        {shotError && <div className="notice warn">{shotError}</div>}
        {shot ? (
          <img src={shot} alt="Экран телевизора" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--line)' }} />
        ) : (
          <p className="muted small">Снимок экрана телевизора прямо сейчас. Он же станет миниатюрой этого телевизора в боковой панели.</p>
        )}
      </div>
    </>
  )
}

function AppsTab({ apps, cfg, set }: { apps: TvApp[]; cfg: HomeConfig; set: SetFn }): ReactNode {
  // Same order as the TV: the saved order first, then the rest alphabetically.
  const ordered = useMemo(() => {
    const by = new Map(apps.map((a) => [a.pkg, a]))
    const first = cfg.order.flatMap((p) => (by.has(p) ? [by.get(p)!] : []))
    const rest = apps.filter((a) => !cfg.order.includes(a.pkg)).sort((a, b) => a.label.localeCompare(b.label))
    return [...first, ...rest]
  }, [apps, cfg.order])
  const hidden = new Set(cfg.hidden)
  return (
    <>
      <div className="home-preview-sticky">
        <HomePreview apps={apps} cfg={cfg} />
      </div>
      <div className="card">
        <h2>Док и порядок</h2>
        <Slider label="Приложений в доке" hint="Первые приложения стоят в ряду крупных плиток. 0 — без дока." value={cfg.dock_size} min={0} max={8} onChange={(v) => set({ dock_size: v }, 300)} />
        <div className="row" style={{ margin: '6px 0 10px' }}>
          <span className="muted small">Перетаскивайте плитки или пользуйтесь стрелками. Выделенные плитки — это док. Приложения из папки видны только в папке.</span>
          <span className="spacer" />
          <button className="btn small ghost" onClick={() => set({ order: [] })}>
            Сбросить порядок
          </button>
          <button className="btn small ghost" onClick={() => set({ hidden: [] })} disabled={!cfg.hidden.length}>
            Показать все
          </button>
        </div>
        <AppOrder
          apps={ordered}
          hidden={hidden}
          columns={cfg.columns}
          dockCount={cfg.dock_size}
          onOrder={(pkgs) => set({ order: pkgs }, 400)}
          onHidden={(pkg, hide) => {
            const next = new Set(hidden)
            if (hide) next.add(pkg)
            else next.delete(pkg)
            set({ hidden: [...next] })
          }}
        />
      </div>
      <Groups
        kind="rows"
        title="Ряды"
        hint="Именованные ряды приложений, например «Видео» или «Музыка». Приложение может быть и в ряду, и в общем списке."
        groups={cfg.rows}
        apps={ordered}
        max={8}
        onChange={(rows) => set({ rows }, 500)}
      />
      <Groups
        kind="folders"
        title="Папки"
        hint="Папка выглядит как одна плитка, по OK на пульте она открывается. Приложения из папки уходят из дока и общего списка."
        groups={cfg.folders}
        apps={ordered}
        max={12}
        onChange={(folders) => set({ folders }, 500)}
      />
    </>
  )
}

/** Named rows or folders: rename, fill with apps, reorder, remove. */
function Groups(props: { kind: 'rows' | 'folders'; title: string; hint: string; groups: HomeGroup[]; apps: TvApp[]; max: number; onChange: (g: HomeGroup[]) => void }): ReactNode {
  const { groups, apps, onChange } = props
  const label = (pkg: string): string => apps.find((a) => a.pkg === pkg)?.label ?? pkg
  const update = (i: number, g: HomeGroup): void => onChange(groups.map((x, j) => (j === i ? g : x)))
  const move = (i: number, by: number): void => {
    const next = [...groups]
    const [g] = next.splice(i, 1)
    next.splice(i + by, 0, g)
    onChange(next)
  }
  const fresh = props.kind === 'rows' ? 'Новый ряд' : 'Новая папка'
  return (
    <div className="card">
      <div className="card-head">
        <h2>{props.title}</h2>
        <button className="btn small" disabled={groups.length >= props.max} onClick={() => onChange([...groups, { name: `${fresh} ${groups.length + 1}`, apps: [] }])}>
          {props.kind === 'rows' ? 'Добавить ряд' : 'Добавить папку'}
        </button>
      </div>
      <p className="muted small">{props.hint}</p>
      {groups.map((g, i) => (
        <div key={i} className="group-card">
          <div className="row">
            <input type="text" maxLength={30} value={g.name} aria-label={`Название: ${props.kind === 'rows' ? 'ряд' : 'папка'}`} onChange={(e) => update(i, { ...g, name: e.target.value })} style={{ flex: 1 }} />
            <button className="btn small ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше">
              ↑
            </button>
            <button className="btn small ghost" disabled={i === groups.length - 1} onClick={() => move(i, 1)} aria-label="Ниже">
              ↓
            </button>
            <button className="btn small ghost" onClick={() => onChange(groups.filter((_, j) => j !== i))}>
              Удалить
            </button>
          </div>
          <div className="chips">
            {g.apps.length === 0 && <span className="muted small">Пока пусто: на телевизоре он скрыт, пока вы не добавите приложения.</span>}
            {g.apps.map((p) => (
              <span key={p} className="chip-app">
                {label(p)}
                <button aria-label={`Убрать ${label(p)}`} onClick={() => update(i, { ...g, apps: g.apps.filter((x) => x !== p) })}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <select
            value=""
            aria-label="Добавить приложение"
            onChange={(e) => e.target.value && update(i, { ...g, apps: [...g.apps, e.target.value] })}
          >
            <option value="">Добавить приложение…</option>
            {apps.filter((a) => !g.apps.includes(a.pkg)).map((a) => (
              <option key={a.pkg} value={a.pkg}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}

const LAYOUTS: { id: HomeLayout; label: string; hint: string; mini: [number, number, number, number, boolean][] }[] = [
  { id: 'shelf', label: 'Полка', hint: 'Верхняя панель, свободное место, приложения ниже.', mini: [[6, 6, 30, 6, true], [64, 6, 30, 6, true], [6, 40, 88, 24, false], [6, 72, 88, 18, true]] },
  { id: 'split', label: 'Колонки', hint: 'Часы и быстрые настройки слева, приложения справа.', mini: [[6, 10, 26, 18, true], [6, 62, 20, 24, true], [38, 8, 56, 26, false], [38, 42, 56, 18, true]] },
  { id: 'rail', label: 'Рейка', hint: 'Значки вдоль левого края, которые раскрываются с подписями.', mini: [[3, 6, 6, 84, true], [70, 6, 24, 8, true], [16, 24, 78, 28, false], [16, 60, 78, 18, true]] },
  { id: 'mirror', label: 'Зеркало', hint: 'Приложения слева, часы и быстрые настройки справа.', mini: [[68, 10, 26, 18, true], [68, 62, 20, 24, true], [6, 8, 56, 26, false], [6, 42, 56, 18, true]] },
  { id: 'center', label: 'По центру', hint: 'Часы, погода и значки по центру сверху, ниже приложения.', mini: [[34, 6, 32, 10, true], [28, 19, 44, 6, true], [6, 36, 88, 24, false], [6, 68, 88, 18, true]] },
  { id: 'bottom', label: 'Информация внизу', hint: 'Приложения сверху, часы, погода и значки в полосе внизу.', mini: [[6, 6, 88, 26, false], [6, 38, 88, 24, false], [6, 82, 22, 10, true], [72, 82, 22, 10, true]] },
  { id: 'free', label: 'Только свободная область', hint: 'Без дока, рядов и списка: на экране только иконки, расставленные вами.', mini: [[12, 14, 22, 20, false], [58, 10, 24, 20, false], [30, 52, 22, 22, false], [70, 60, 20, 18, false]] }
]

const SECTION_LABEL: Record<HomeSection, string> = { nowplaying: 'Сейчас играет', weather: 'Погода (виджет)', news: 'Новости', dock: 'Док', rows: 'Ряды', folders: 'Папки', grid: 'Все приложения', free: 'Свободная область' }
const ALL_SECTIONS: HomeSection[] = ['nowplaying', 'weather', 'news', 'dock', 'rows', 'folders', 'free', 'grid']
const ALL_QUICK: QuickId[] = ['inputs', 'wifi', 'bluetooth', 'display', 'apps', 'sleep', 'search', 'music', 'drawer', 'tune', 'settings']

/** Turn items on and off and put the ones that are on in order. */
function OrderList<T extends string>(props: { all: T[]; on: T[]; label: (t: T) => ReactNode; onChange: (on: T[]) => void }): ReactNode {
  const { on, onChange } = props
  const items = [...on, ...props.all.filter((t) => !on.includes(t))]
  const move = (t: T, by: number): void => {
    const i = on.indexOf(t)
    const next = [...on]
    next.splice(i, 1)
    next.splice(i + by, 0, t)
    onChange(next)
  }
  return (
    <ul className="order-list">
      {items.map((t) => {
        const i = on.indexOf(t)
        return (
          <li key={t} className={i < 0 ? 'off' : ''}>
            <label className="grow">
              <input type="checkbox" checked={i >= 0} onChange={(e) => onChange(e.target.checked ? [...on, t] : on.filter((x) => x !== t))} />
              {props.label(t)}
            </label>
            <button className="btn small ghost" disabled={i <= 0} onClick={() => move(t, -1)} aria-label="Earlier">
              ↑
            </button>
            <button className="btn small ghost" disabled={i < 0 || i === on.length - 1} onClick={() => move(t, 1)} aria-label="Later">
              ↓
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function LayoutTab({ apps, cfg, set }: { apps: TvApp[]; cfg: HomeConfig; set: SetFn }): ReactNode {
  return (
    <>
      <div className="home-preview-sticky">
        <HomePreview apps={apps} cfg={cfg} />
      </div>
      <div className="card">
        <h2>Макет</h2>
        {cfg.layout === 'free' && <p className="muted small" style={{ marginTop: 0 }}>Включён режим «Только свободная область»: док, ряды, папки и список приложений не показываются. Иконки расставляются на вкладке «Расстановка и меню». Чтобы вернуть обычный макет, выберите другой.</p>}
        <div className="layout-pick">
          {LAYOUTS.map((l) => (
            <button key={l.id} className={cfg.layout === l.id ? 'on' : ''} onClick={() => set({ layout: l.id })} aria-pressed={cfg.layout === l.id}>
              <span className="mini" aria-hidden>
                {l.mini.map(([x, y, w, h, dim], i) => (
                  <i key={i} className={dim ? 'dim' : ''} style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }} />
                ))}
              </span>
              <b>{l.label}</b>
              <span className="muted small">{l.hint}</span>
            </button>
          ))}
        </div>
        {(cfg.layout === 'shelf' || cfg.layout === 'center') && (
          <div style={{ marginTop: 14 }}>
            <Slider label="Место над приложениями" hint="Свободные обои между верхней панелью и первым рядом." value={cfg.top_space} min={0} max={40} unit="%" onChange={(v) => set({ top_space: v }, 250)} />
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Разделы</h2>
          <p className="muted small">Сверху вниз. Снимите галочку, чтобы скрыть раздел.</p>
          <OrderList all={ALL_SECTIONS} on={cfg.sections} label={(s) => SECTION_LABEL[s]} onChange={(sections) => set({ sections })} />
        </div>
        <div className="card">
          <h2>Быстрые настройки</h2>
          <p className="muted small">
            {cfg.layout === 'rail' ? 'Значки в рейке.' : cfg.layout === 'split' ? 'Внизу левой части.' : cfg.layout === 'mirror' ? 'Внизу правой части.' : cfg.layout === 'bottom' ? 'В полосе внизу, справа.' : cfg.layout === 'center' ? 'Под часами, по центру.' : 'Под часами и датой.'} Телевизор скрывает те, что не может открыть, например «Входы» на приставке
            без HDMI-входов или «Поиск», когда приложение поиска отключено.
          </p>
          <OrderList
            all={ALL_QUICK}
            on={cfg.quick}
            label={(q) => (
              <>
                <QuickIcon id={q} /> {QUICK_LABEL[q]}
                {cfg.quick_available && !cfg.quick_available.includes(q) && <span className="muted small">нет на этом ТВ</span>}
              </>
            )}
            onChange={(quick) => set({ quick })}
          />
        </div>
      </div>

      <div className="card">
        <h2>Размеры</h2>
        <Slider label="Плитки дока" value={cfg.dock_scale} min={60} max={150} step={5} unit="%" onChange={(v) => set({ dock_scale: v }, 250)} />
        <Slider label="Плитки рядов и папок" value={cfg.tile_scale} min={60} max={150} step={5} unit="%" onChange={(v) => set({ tile_scale: v }, 250)} />
        <Slider label="Приложений в строке «Всех приложений»" value={cfg.columns} min={3} max={8} onChange={(v) => set({ columns: v }, 250)} />
        <Toggle label="Показывать названия приложений" hint="Под каждой плиткой. Приложения без ТВ-баннера всегда показывают название." checked={cfg.show_names} onChange={(v) => set({ show_names: v })} />
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Часы</h2>
          <div className="seg">
            {([['time_date', 'Время и дата'], ['time', 'Только время'], ['off', 'Выкл.']] as const).map(([id, label]) => (
              <button key={id} className={cfg.clock === id ? 'on' : ''} onClick={() => set({ clock: id })}>
                {label}
              </button>
            ))}
          </div>
          {cfg.clock !== 'off' && (
            <div style={{ marginTop: 14 }}>
              <Slider label="Размер часов" value={cfg.clock_scale} min={70} max={180} step={10} unit="%" onChange={(v) => set({ clock_scale: v }, 250)} />
            </div>
          )}
        </div>
        <div className="card">
          <h2>Приветствие</h2>
          <label className="field">
            <span>Ваше имя</span>
            <span className="hint">Показывает «Добрый вечер, имя». Оставьте пустым, чтобы приветствия не было.</span>
            <input type="text" maxLength={40} value={cfg.greeting} placeholder="например, Саша" onChange={(e) => set({ greeting: e.target.value }, 700)} />
          </label>
        </div>
      </div>
    </>
  )
}

const DRAWER_STYLES: { id: DrawerStyle; label: string; hint: string }[] = [
  { id: 'sheet', label: 'Снизу', hint: 'Панель поверх нижней части экрана.' },
  { id: 'side', label: 'Справа', hint: 'Узкая панель, три приложения в ряду.' },
  { id: 'full', label: 'На весь экран', hint: 'Весь экран занят списком приложений.' }
]

/** Free placement of icons, and the All apps list kept out of sight until it is asked for. */
function PlaceTab({ apps, cfg, set }: { apps: TvApp[]; cfg: HomeConfig; set: SetFn }): ReactNode {
  const [snap, setSnap] = useState(true)
  const [pick, setPick] = useState('')
  const label = new Map(apps.map((a) => [a.pkg, a.label]))
  const placed = new Set(cfg.free.map((f) => f.pkg))
  const choices = apps.filter((a) => !placed.has(a.pkg) && !cfg.hidden.includes(a.pkg)).sort((a, b) => a.label.localeCompare(b.label))
  const freeOn = cfg.sections.includes('free')

  /** The free area shows only while it is among the sections; put it just above All apps. */
  const withSection = (sections: HomeConfig['sections']): HomeConfig['sections'] => {
    if (sections.includes('free')) return sections
    const i = sections.indexOf('grid')
    return i < 0 ? [...sections, 'free'] : [...sections.slice(0, i), 'free', ...sections.slice(i)]
  }
  const setFree = (free: HomeFree[], wait = 300): void => set({ free }, wait)
  function add(pkg: string): void {
    if (!pkg) return
    set({ free: [...cfg.free, { pkg, ...nextSpot(cfg.free) }], sections: withSection(cfg.sections) })
    setPick('')
  }

  const buttonOpens = cfg.buttons_on && cfg.buttons.some((b) => b.action === 'drawer')
  const canOpenMenu = cfg.drawer_pill || cfg.quick.includes('drawer') || buttonOpens

  return (
    <>
      <div className="home-preview-sticky">
        <HomePreview apps={apps} cfg={cfg} />
      </div>

      <div className="card">
        <h2>Свободная область</h2>
        <p className="muted small">
          Размещайте значки где угодно, а не рядами. Перетащите плитку или щёлкните по ней и двигайте стрелками (Shift — шаг крупнее). Приложение, поставленное сюда, уходит из дока и из «Всех приложений». Картинка показана для макета «Полка»;
          в «Колонках» и «Рейке» ширина меньше, но плитки сохраняют своё относительное положение. Двигать и добавлять иконки можно и с пульта: кнопка Menu → «Двигать иконки» или «Добавить приложение».
        </p>
        <Toggle label="Показывать свободную область" hint="Она стоит среди разделов; порядок меняется во вкладке «Макет»." checked={freeOn} onChange={(on) => set({ sections: on ? withSection(cfg.sections) : cfg.sections.filter((s) => s !== 'free') })} />
        <Toggle label="Отключить макет: только свободная область" hint="Экран занят только вашими иконками. Док, ряды, папки и «Все приложения» скрываются; часы, погода и быстрые настройки остаются." checked={cfg.layout === 'free'} onChange={(on) => set(on ? { layout: 'free', sections: withSection(cfg.sections) } : { layout: 'shelf' })} />
        <div className="grid-2" style={{ marginTop: 10 }}>
          <Slider label="Высота области" hint="Процент высоты экрана." value={cfg.free_height} min={20} max={80} step={5} unit="%" onChange={(v) => set({ free_height: v }, 250)} />
          <Slider label="Размер плиток" value={cfg.free_scale} min={60} max={200} step={10} unit="%" onChange={(v) => set({ free_scale: v }, 250)} />
        </div>
        <FreeEditor apps={apps} cfg={cfg} snap={snap} onChange={setFree} />
        <div className="row" style={{ marginTop: 12 }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Приложение для размещения">
            <option value="">Выберите приложение…</option>
            {choices.map((a) => (
              <option key={a.pkg} value={a.pkg}>
                {a.label}
              </option>
            ))}
          </select>
          <button className="btn small" disabled={!pick} onClick={() => add(pick)}>
            Поставить
          </button>
          <button className="btn small ghost" disabled={cfg.free.length < 2} onClick={() => setFree(tidy(cfg.free), 150)}>
            Выровнять по сетке
          </button>
          <button className="btn small ghost" disabled={!cfg.free.length} onClick={() => setFree([], 150)}>
            Убрать все
          </button>
          <label className="row small" style={{ marginLeft: 'auto' }}>
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Привязка к сетке 5%
          </label>
        </div>
        {cfg.free.length > 0 && (
          <ul className="placed-list">
            {cfg.free.map((f) => (
              <li key={f.pkg}>
                <span className="grow">{label.get(f.pkg) ?? f.pkg}</span>
                <code>
                  {f.x}% · {f.y}%
                </code>
                <button className="btn small ghost" onClick={() => setFree(cfg.free.filter((x) => x.pkg !== f.pkg), 150)} aria-label={`Убрать ${label.get(f.pkg) ?? f.pkg}`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Меню приложений</h2>
        <p className="muted small">Уберите весь список приложений с глаз. Главный экран остаётся чистым, а одно нажатие открывает все приложения в панели.</p>
        <Toggle label="Спрятать «Все приложения» в меню" hint="Раздел «Все приложения» уходит со страницы, а меню показывает все приложения." checked={cfg.drawer_on} onChange={(v) => set({ drawer_on: v })} />
        {cfg.drawer_on && (
          <>
            <div className="layout-pick" style={{ marginTop: 14 }}>
              {DRAWER_STYLES.map((d) => (
                <button key={d.id} className={cfg.drawer_style === d.id ? 'on' : ''} onClick={() => set({ drawer_style: d.id })} aria-pressed={cfg.drawer_style === d.id}>
                  <b>{d.label}</b>
                  <span className="muted small">{d.hint}</span>
                </button>
              ))}
            </div>
            <div className="grid-2" style={{ marginTop: 14 }}>
              <Slider label="Приложений в строке" hint={cfg.drawer_style === 'side' ? 'Боковая панель показывает не больше 3.' : undefined} value={cfg.drawer_columns} min={3} max={8} onChange={(v) => set({ drawer_columns: v }, 250)} />
              <Slider label="Затемнение фона" value={cfg.drawer_dim} min={0} max={95} step={5} unit="%" onChange={(v) => set({ drawer_dim: v }, 250)} />
            </div>
            <Slider
              label="Закрывать после бездействия"
              hint="Секунд без нажатий на пульте. 0 — держать открытым, пока не нажмёте «Назад» или не откроете приложение."
              value={cfg.drawer_autoclose}
              min={0}
              max={120}
              step={5}
              unit=" с"
              onChange={(v) => set({ drawer_autoclose: v }, 250)}
            />
            <h3 style={{ marginTop: 18 }}>Как открывать</h3>
            <Toggle label="Кнопка внизу экрана" hint="Нажмите «вниз» с последнего ряда, чтобы до неё добраться." checked={cfg.drawer_pill} onChange={(v) => set({ drawer_pill: v })} />
            <Toggle
              label="Значок в быстрых настройках"
              hint="Рядом с Wi-Fi и остальными."
              checked={cfg.quick.includes('drawer')}
              onChange={(on) => set({ quick: on ? [...cfg.quick, 'drawer'] : cfg.quick.filter((q) => q !== 'drawer') })}
            />
            <p className="muted small" style={{ marginBottom: 0 }}>
              Или назначьте ей кнопку пульта: на вкладке «Кнопки пульта» выберите «Открыть меню всех приложений».
            </p>
            {!canOpenMenu && (
              <div className="notice warn" style={{ marginTop: 12, marginBottom: 0 }}>
                Меню пока нечем открыть, и приложения окажутся недоступны. Включите кнопку или значок в быстрых настройках либо назначьте кнопку пульта.
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

function Colour({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (c: string, wait?: number) => void }): ReactNode {
  return (
    <label className="field">
      <span>{label}</span>
      {hint && <span className="hint">{hint}</span>}
      <div className="row">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase(), 400)} />
        <input type="text" value={value} style={{ width: 110 }} onChange={(e) => /^#[0-9a-fA-F]{6}$/.test(e.target.value) && onChange(e.target.value.toUpperCase())} />
      </div>
    </label>
  )
}

function LookTab(props: { cfg: HomeConfig; set: SetFn; busy: boolean; wallpaper: (label: string, get: () => Promise<string | null>) => Promise<void> }): ReactNode {
  const { cfg, set, busy, wallpaper } = props
  const file = useRef<HTMLInputElement>(null)
  return (
    <>
      <div className="card">
        <h2>Акцентный цвет</h2>
        <p className="muted">Для свечения или рамки фокуса и музыкальных полос.</p>
        <div className="row">
          {ACCENTS.map((c) => (
            <button
              key={c}
              aria-label={c}
              title={c}
              onClick={() => set({ accent: c })}
              style={{ background: c, width: 32, height: 32, borderRadius: 8, cursor: 'pointer', border: cfg.accent.toUpperCase() === c ? '3px solid var(--navy)' : '1px solid var(--line)' }}
            />
          ))}
          <input type="color" value={cfg.accent} onChange={(e) => set({ accent: e.target.value.toUpperCase() }, 400)} aria-label="Выбрать любой цвет" />
        </div>
      </div>

      <div className="card">
        <h2>Анимации иконок</h2>
        <p className="muted">Как иконка отвечает, когда на неё наводят пульт, и плавный переход при смене макета.</p>
        <div className="seg">
          {([['zoom', 'Увеличение'], ['lift', 'Подъём'], ['bounce', 'Пружина'], ['none', 'Без анимации']] as [AnimStyle, string][]).map(([id, label]) => (
            <button key={id} className={cfg.anim_style === id ? 'on' : ''} onClick={() => set({ anim_style: id })}>
              {label}
            </button>
          ))}
        </div>
        {cfg.anim_style !== 'none' && (
          <div style={{ marginTop: 14 }}>
            <Slider label="Скорость анимации" hint="Меньше — плавнее и медленнее, больше — резче." value={cfg.anim_speed} min={50} max={200} step={10} unit="%" onChange={(v) => set({ anim_speed: v }, 250)} />
          </div>
        )}
      </div>

      <div className="card">
        <h2>Язык лаунчера на телевизоре</h2>
        <p className="muted">На каком языке показывать надписи на самом телевизоре: названия разделов, меню, приветствие.</p>
        <div className="seg">
          {([['ru', 'Русский'], ['en', 'English'], ['auto', 'Как в системе ТВ']] as const).map(([id, label]) => (
            <button key={id} className={cfg.language === id ? 'on' : ''} onClick={() => set({ language: id })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Фокус</h2>
        <p className="muted">Как выделяется плитка, на которую наведён пульт.</p>
        <div className="seg">
          {([['glow', 'Свечение'], ['outline', 'Рамка'], ['none', 'Нет']] as const).map(([id, label]) => (
            <button key={id} className={cfg.focus === id ? 'on' : ''} onClick={() => set({ focus: id })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Обои</h2>
        <p className="muted">{cfg.has_wallpaper ? 'Обои установлены.' : 'Обоев нет: виден цвет фона.'}</p>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) wallpaper('Готовлю и отправляю картинку', async () => (await prepareWallpaper(f, 'wallpaper.jpg')).base64)
          }}
        />
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn" disabled={busy} onClick={() => file.current?.click()}>
            Выбрать картинку…
          </button>
          <button className="btn" disabled={busy} onClick={() => wallpaper('Загружаю картинку дня из Bing', async () => (await fetchBingDaily()).base64)}>
            Картинка дня Bing
          </button>
          {cfg.has_wallpaper && (
            <button className="btn ghost" disabled={busy} onClick={() => wallpaper('Удаляю обои', async () => null)}>
              Удалить
            </button>
          )}
        </div>
        <Slider label="Затемнить обои" hint="Названия и часы остаются читаемыми на ярких картинках." value={cfg.wallpaper_dim} min={0} max={80} unit="%" onChange={(v) => set({ wallpaper_dim: v }, 300)} />
        <Colour label="Цвет фона" hint="Виден, когда обоев нет. Берите тёмный: текст белый." value={cfg.background} onChange={(c, w) => set({ background: c }, w)} />
      </div>
    </>
  )
}

function WidgetsTab({ cfg, set }: { cfg: HomeConfig; set: SetFn }): ReactNode {
  const playing = cfg.sections.includes('nowplaying')
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(): Promise<void> {
    setSearching(true)
    setError(null)
    try {
      setPlaces(await findPlaces(query))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSearching(false)
    }
  }

  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null)
  const [checking, setChecking] = useState(false)
  async function verify(): Promise<void> {
    setChecking(true)
    setCheck(null)
    try {
      const r = await checkWeather(cfg.weather_lat, cfg.weather_lon, cfg.weather_source)
      setCheck({ ok: true, text: `${r.source} отвечает: сейчас в «${cfg.weather_place}» около ${r.temp}°. Значит, место выбрано верно. Если на телевизоре погоды нет, там написана причина по каждому источнику (например, UnknownHostException — у ТВ нет доступа к интернету или DNS блокирует адрес; «капча» — Яндекс не пустил телевизор).` })
    } catch (e) {
      setCheck({ ok: false, text: errorText(e) })
    } finally {
      setChecking(false)
    }
  }

  function pick(p: Place): void {
    set({ weather_place: p.name, weather_lat: p.lat, weather_lon: p.lon })
    setPlaces(null)
    setQuery('')
  }

  return (
    <>
      <div className="card">
        <Toggle
          label="Сейчас играет"
          hint="Карточка с тем, что играет в любом музыкальном или видеоприложении, с кнопками «Играть», «Пауза» и «Далее». Показывается, только пока что-то загружено. Телевизор позволяет CleanMyTV Home видеть, какое приложение играет; уведомления он не читает."
          checked={playing}
          onChange={(v) => set({ sections: v ? ['nowplaying', ...cfg.sections.filter((s) => s !== 'nowplaying')] : cfg.sections.filter((s) => s !== 'nowplaying') })}
        />
        {playing && <p className="small muted" style={{ margin: '8px 0 0' }}>Двигайте её выше или ниже в разделе «Макет → Разделы».</p>}
      </div>

      <div className="card">
        <h2>Погода</h2>
        <p className="muted">
          Температура, сегодняшний максимум и минимум и состояние неба рядом с часами. Данные берутся из Open-Meteo: бесплатно и без регистрации.
          Телевизор запрашивает их каждые 30 минут.
        </p>
        <Toggle
          label="Большой виджет погоды над доком"
          hint="Крупная карточка: температура, состояние неба, ощущается, ветер, влажность и прогноз на 4 дня. Нужен выбранный город. Строка рядом с часами тогда скрывается."
          checked={cfg.sections.includes('weather')}
          onChange={(on) => set({ sections: on ? withBefore(cfg.sections, 'weather', ['dock', 'rows', 'folders', 'grid']) : cfg.sections.filter((s) => s !== 'weather') })}
        />
        {cfg.weather_place ? (
          <div className="row" style={{ margin: '14px 0' }}>
            <span>
              Показываю погоду: <b>{cfg.weather_place}</b>
            </span>
            <button className="btn small ghost" onClick={() => set({ weather_place: '' })}>
              Выключить
            </button>
            <button className="btn small" disabled={checking} onClick={() => void verify()}>
              Проверить погоду
            </button>
            {checking && <Busy text="Проверяю" />}
          </div>
        ) : null}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            void search()
          }}
        >
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Город или населённый пункт" style={{ width: 240 }} />
          <button className="btn" type="submit" disabled={searching || query.trim().length < 2}>
            {cfg.weather_place ? 'Сменить место' : 'Найти'}
          </button>
          {searching && <Busy text="Ищу" />}
        </form>
        {check && <div className={`notice ${check.ok ? 'ok' : 'error'}`} style={{ marginBottom: 14 }}>{check.text}</div>}
        {error && <div className="notice error" style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}
        {places && (
          <ul className="place-list">
            {places.length === 0 && <li className="small muted">Такого места не нашлось. Попробуйте ближайший город.</li>}
            {places.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button className="btn small ghost" onClick={() => pick(p)}>
                  <b>{p.name}</b>
                  {p.detail && <span className="muted">&nbsp;· {p.detail}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="small muted" style={{ marginBottom: 6 }}>Откуда брать погоду. Если выбранный источник не ответил, телевизор сам пробует второй.</p>
        <div className="seg">
          {([['yandex', 'Яндекс.Погода'], ['openmeteo', 'Open-Meteo']] as const).map(([id, label]) => (
            <button key={id} className={cfg.weather_source === id ? 'on' : ''} onClick={() => set({ weather_source: id })}>
              {label}
            </button>
          ))}
        </div>
        <p className="small muted" style={{ margin: '10px 0 0' }}>Погода берётся для города, который вы нашли выше (по его координатам). Ссылка на Яндекс из вашего сообщения вела на Химки, а не на Екатеринбург, поэтому здесь найдите «Екатеринбург».</p>
        <div className="seg" style={{ marginTop: 14 }}>
          {([['c', '°C'], ['f', '°F']] as const).map(([id, label]) => (
            <button key={id} className={cfg.weather_unit === id ? 'on' : ''} onClick={() => set({ weather_unit: id })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <NewsCard cfg={cfg} set={set} />
    </>
  )
}

/** Puts a section just before the first of `before` that is on; at the end if none is. */
function withBefore(sections: HomeConfig['sections'], id: HomeConfig['sections'][number], before: HomeConfig['sections']): HomeConfig['sections'] {
  if (sections.includes(id)) return sections
  const i = sections.findIndex((s) => before.includes(s))
  return i < 0 ? [...sections, id] : [...sections.slice(0, i), id, ...sections.slice(i)]
}

function NewsCard({ cfg, set }: { cfg: HomeConfig; set: SetFn }): ReactNode {
  const on = cfg.sections.includes('news')
  const [url, setUrl] = useState(cfg.news_url)
  const [checking, setChecking] = useState(false)
  const [found, setFound] = useState<Headline[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function verify(): Promise<void> {
    setChecking(true)
    setFound(null)
    setError(null)
    try {
      setFound(await checkNews(url.trim()))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="card">
      <h2>Новости</h2>
      <p className="muted">
        Карточка с последними заголовками. По OK на заголовке телевизор открывает статью в браузере, если он на ТВ есть. Для сайта Е1.ру заголовки берутся прямо со страницы;
        для других сайтов укажите адрес RSS-ленты.
      </p>
      <Toggle
        label="Показывать новости на главном экране"
        hint="Карточка стоит над доком; порядок меняется во вкладке «Макет → Разделы»."
        checked={on}
        onChange={(v) => set({ sections: v ? withBefore(cfg.sections, 'news', ['dock', 'rows', 'folders', 'grid']) : cfg.sections.filter((s) => s !== 'news') })}
      />
      <label className="field" style={{ marginTop: 14 }}>
        <span>Адрес страницы или RSS-ленты</span>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => url.trim() !== cfg.news_url && set({ news_url: url.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && url.trim() !== cfg.news_url && set({ news_url: url.trim() })}
          placeholder="https://www.e1.ru/"
          style={{ width: 360 }}
        />
      </label>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <Slider label="Заголовков" value={cfg.news_count} min={3} max={8} onChange={(v) => set({ news_count: v }, 250)} />
        <Slider label="Обновлять раз в" value={cfg.news_refresh} min={10} max={120} step={5} unit=" мин" onChange={(v) => set({ news_refresh: v }, 250)} />
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn small" disabled={checking || !url.trim()} onClick={() => void verify()}>
          Проверить новости
        </button>
        {checking && <Busy text="Проверяю" />}
      </div>
      {error && <div className="notice error" style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}
      {found && (
        <div className="notice ok" style={{ marginTop: 12, marginBottom: 0 }}>
          Нашлось заголовков: {found.length}. Первые:
          <ul>
            {found.slice(0, 3).map((h) => (
              <li key={h.url}>{h.title}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function MusicTab({ cfg, set }: { cfg: HomeConfig; set: SetFn }): ReactNode {
  return (
    <>
      <div className="card">
        <Toggle
          label="Музыкальные полосы"
          hint="Полосы внизу главного экрана, которые движутся под музыку или видео на телевизоре. Нажатия на пульте их не запускают. Добавьте значок «Музыкальные полосы» в «Макет → Быстрые настройки», чтобы включать и выключать их с телевизора."
          checked={cfg.visualiser}
          onChange={(v) => set({ visualiser: v })}
        />
        <BarsPreview cfg={cfg} />
      </div>
      {cfg.visualiser && (
        <>
          <div className="card">
            <h2>Стиль</h2>
            <div className="seg" style={{ marginBottom: 12 }}>
              {([['bars', 'Полосы'], ['mirror', 'Зеркально'], ['wave', 'Волна']] as const).map(([id, label]) => (
                <button key={id} className={cfg.viz_style === id ? 'on' : ''} onClick={() => set({ viz_style: id })}>
                  {label}
                </button>
              ))}
            </div>
            <div className="seg" style={{ marginBottom: 12 }}>
              {([['accent', 'Акцентный цвет'], ['rainbow', 'Радуга'], ['white', 'Белый']] as const).map(([id, label]) => (
                <button key={id} className={cfg.viz_colour === id ? 'on' : ''} onClick={() => set({ viz_colour: id })}>
                  {label}
                </button>
              ))}
            </div>
            {cfg.viz_style !== 'wave' && <Toggle label="Пиковые точки" hint="Маленькая отметка над каждой полосой, которая медленно опускается." checked={cfg.viz_peaks} onChange={(v) => set({ viz_peaks: v })} />}
          </div>
          <div className="card">
            <h2>Размер и отклик</h2>
            <Slider label="Полос" value={cfg.viz_bars} min={8} max={64} step={4} onChange={(v) => set({ viz_bars: v }, 300)} />
            <Slider label="Высота" hint="Какую часть экрана они могут занимать." value={cfg.viz_height} min={4} max={40} unit="%" onChange={(v) => set({ viz_height: v }, 300)} />
            <Slider label="Непрозрачность" value={cfg.viz_opacity} min={20} max={100} unit="%" onChange={(v) => set({ viz_opacity: v }, 300)} />
            <Slider label="Чувствительность" hint="Чем выше, тем сильнее реагирует тихая музыка." value={cfg.viz_sensitivity} min={25} max={300} step={5} unit="%" onChange={(v) => set({ viz_sensitivity: v }, 300)} />
          </div>
        </>
      )}
    </>
  )
}

const ACTIONS: [ButtonAction, string][] = [
  ['settings', 'Открыть «Настройки»'],
  ['inputs', 'Открыть «Входы»'],
  ['home', 'На главный экран'],
  ['back', 'Назад'],
  ['app', 'Открыть приложение…'],
  ['wifi', 'Открыть Wi-Fi'],
  ['bluetooth', 'Открыть Bluetooth и пульты'],
  ['display', 'Открыть «Изображение и звук»'],
  ['apps', 'Открыть список приложений'],
  ['sleep', 'Запустить заставку'],
  ['search', 'Открыть поиск'],
  ['music', 'Музыкальные полосы вкл./выкл.'],
  ['drawer', 'Открыть меню всех приложений'],
  ['tune', 'Открыть настройки главного экрана'],
  ['none', 'Ничего не делать']
]

/** KEYCODE_PROG_RED -> "Prog red". */
const keyName = (name: string): string => {
  const s = name.replace(/^KEYCODE_/, '').toLowerCase().replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function ButtonsTab(props: { cfg: HomeConfig; set: SetFn; apps: TvApp[]; setCfg: (c: HomeConfig) => void; onError: (e: unknown) => void }): ReactNode {
  const { cfg, set, apps } = props
  const [switching, setSwitching] = useState(false)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState<KeyPress[]>([])
  const [names, setNames] = useState<Record<number, string>>({})

  async function toggle(on: boolean): Promise<void> {
    setSwitching(true)
    try {
      props.setCfg(await window.cytv.setRemoteButtons(on))
    } catch (e) {
      props.onError(e)
    } finally {
      setSwitching(false)
    }
  }

  // Listen for 30 seconds: show every button the TV receives from now on.
  useEffect(() => {
    if (!listening) return
    let stop = false
    let since = Number.MAX_SAFE_INTEGER
    const end = Date.now() + 30_000
    void (async () => {
      const first = await window.cytv.homeKeys().catch(() => [])
      since = first.length ? first[first.length - 1].seq : 0
      setHeard([])
      while (!stop && Date.now() < end) {
        await new Promise((r) => setTimeout(r, 600))
        const keys = await window.cytv.homeKeys().catch(() => [])
        const fresh = keys.filter((k) => k.seq > since)
        if (fresh.length) {
          since = fresh[fresh.length - 1].seq
          setHeard((prev) => [...prev, ...fresh].slice(-12))
          setNames((prev) => ({ ...prev, ...Object.fromEntries(fresh.map((k) => [k.code, k.name])) }))
        }
      }
      if (!stop) setListening(false)
    })()
    return () => { stop = true }
  }, [listening])

  const mapped = new Set(cfg.buttons.map((b) => b.code))
  const update = (buttons: HomeButton[]): void => set({ buttons })
  const label = (code: number): string => (names[code] ? `${keyName(names[code])} · ${code}` : `Кнопка ${code}`)

  return (
    <>
      <div className="card">
        <Toggle
          label="Кнопки пульта"
          hint="Позволяет CleanMyTV Home назначать кнопкам новые действия во всех приложениях. Затрагиваются только добавленные ниже кнопки, остальные работают как раньше. Используется служба специальных возможностей Android, которая включается и выключается отсюда."
          checked={cfg.buttons_on}
          disabled={switching}
          onChange={toggle}
        />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Найти кнопку</h2>
          <button className="btn small" onClick={() => setListening(!listening)}>
            {listening ? 'Остановить' : 'Слушать'}
          </button>
        </div>
        <p className="muted small">
          Нажмите «Слушать», затем нажимайте кнопки на пульте. Каждая принятая телевизором кнопка появится здесь с её кодом.
          {!cfg.buttons_on && ' Когда «Кнопки пульта» выключены, видны только нажатия на главном экране.'} Кнопка, которая так и не появляется
          (часто это питание, громкость или микрофон), обрабатывается раньше, чем её увидит Android, поэтому на этом телевизоре ей нельзя назначить новое действие.
        </p>
        {listening && heard.length === 0 && <Busy text="Слушаю. Нажмите кнопку на пульте" />}
        {heard.length > 0 && (
          <ul className="order-list">
            {heard.map((k) => (
              <li key={k.seq}>
                <span className="grow">
                  <b>{keyName(k.name)}</b>
                  <span className="muted small">код {k.code}</span>
                </span>
                <button className="btn small" disabled={mapped.has(k.code)} onClick={() => update([...cfg.buttons, { code: k.code, action: 'settings' }])}>
                  {mapped.has(k.code) ? 'Добавлена' : 'Назначить действие'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Действия кнопок</h2>
        {cfg.buttons.length === 0 ? (
          <p className="muted small">Пока нет. Найдите кнопку выше и назначьте ей действие.</p>
        ) : (
          <ul className="order-list">
            {cfg.buttons.map((b, i) => (
              <li key={b.code}>
                <span className="grow">
                  <b>{label(b.code)}</b>
                </span>
                <select
                  value={b.action}
                  aria-label={`Действие для ${label(b.code)}`}
                  onChange={(e) => {
                    const action = e.target.value as ButtonAction
                    update(cfg.buttons.map((x, j) => (j === i ? { code: x.code, action, ...(action === 'app' ? { app: apps[0]?.pkg } : {}) } : x)))
                  }}
                >
                  {ACTIONS.map(([id, text]) => (
                    <option key={id} value={id}>
                      {text}
                    </option>
                  ))}
                </select>
                {b.action === 'app' && (
                  <select value={b.app ?? ''} aria-label="Приложение для запуска" onChange={(e) => update(cfg.buttons.map((x, j) => (j === i ? { ...x, app: e.target.value } : x)))}>
                    {apps.map((a) => (
                      <option key={a.pkg} value={a.pkg}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                )}
                <button className="btn small ghost" onClick={() => update(cfg.buttons.filter((_, j) => j !== i))}>
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        )}
        {cfg.buttons.length > 0 && !cfg.buttons_on && <p className="small muted" style={{ marginTop: 8 }}>Включите «Кнопки пульта» выше, чтобы это работало.</p>}
      </div>
    </>
  )
}

/** A rough picture of the chosen bars, moving to a made-up beat. */
function BarsPreview({ cfg }: { cfg: HomeConfig }): ReactNode {
  const [t, setT] = useState(0)
  useEffect(() => {
    let id = 0
    const tick = (now: number): void => {
      setT(now / 1000)
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])
  if (!cfg.visualiser) return null
  const n = cfg.viz_bars
  const W = 640
  const H = Math.max(24, (360 * cfg.viz_height) / 100)
  const levels = Array.from({ length: n }, (_, i) => {
    const x = i / n
    const beat = 0.55 + 0.45 * Math.abs(Math.sin(t * 2.2))
    return Math.min(1, (0.25 + 0.6 * Math.abs(Math.sin(i * 1.7 + t * 3.1)) * (1 - x * 0.35)) * beat)
  })
  const colour = (i: number): string => (cfg.viz_colour === 'rainbow' ? `hsl(${(300 * i) / Math.max(1, n - 1)} 75% 60%)` : cfg.viz_colour === 'white' ? '#FFFFFF' : cfg.accent)
  const op = cfg.viz_opacity / 100
  const gap = (W / n) * 0.22
  const w = (W - gap * (n + 1)) / n
  let body: ReactNode
  if (cfg.viz_style === 'wave') {
    const pts = levels.map((v, i) => `${(i * W) / (n - 1)},${H - v * H * 0.9}`)
    body = <polyline points={pts.join(' ')} fill="none" stroke={colour(0)} strokeOpacity={op} strokeWidth={3} strokeLinejoin="round" />
  } else {
    const mirror = cfg.viz_style === 'mirror'
    const base = mirror ? H / 2 : H
    const span = mirror ? H / 2 : H
    body = levels.map((v, i) => (
      <g key={i}>
        <rect x={gap + i * (w + gap)} y={base - v * span} width={w} height={v * span} rx={Math.min(w / 3, 4)} fill={colour(i)} fillOpacity={op} />
        {mirror && <rect x={gap + i * (w + gap)} y={base} width={w} height={v * span} rx={Math.min(w / 3, 4)} fill={colour(i)} fillOpacity={op * 0.3} />}
        {cfg.viz_peaks && <rect x={gap + i * (w + gap)} y={base - Math.min(1, v + 0.08) * span - 4} width={w} height={3} rx={1.5} fill={colour(i)} fillOpacity={op} />}
      </g>
    ))
  }
  return (
    <div style={{ background: cfg.background, borderRadius: 10, padding: '40px 0 0', marginTop: 12, overflow: 'hidden' }} aria-label="Предпросмотр музыкальных полос">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {body}
      </svg>
    </div>
  )
}
