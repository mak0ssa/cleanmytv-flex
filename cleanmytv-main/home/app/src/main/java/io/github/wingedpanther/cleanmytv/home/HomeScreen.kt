package io.github.wingedpanther.cleanmytv.home

import android.graphics.BitmapFactory
import android.util.Log
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AcUnit
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.Dehaze
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material.icons.outlined.NightsStay
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.SkipNext
import androidx.compose.material.icons.outlined.Thunderstorm
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material.icons.outlined.WbCloudy
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.tv.material3.Border
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.Glow
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.text.DateFormat
import java.util.Calendar
import java.util.Date

// CleanMyTV's dark world: warm off-white and sand text on the green-black ground.
private val TEXT = Color(0xFFF0EBE5)
private val MUTED = Color(0xFFD7CFC4)
private val TILE = Color(0xE62D3A2E)
private val TILE_FOCUSED = Color(0xFF3A4A3B)
private val GROUND = Color(0xFF1C2A1F)
private val PANEL = Color(0xFF2D3A2E)

// The desktop app's face, for the clock and date: tabular figures that don't jitter as the minutes turn.
private val CLOCK = FontFamily(Font(R.font.jetbrains_mono_light, FontWeight.Light), Font(R.font.jetbrains_mono_regular, FontWeight.Normal))

/** Text on an accent fill: the ground colour or off-white, whichever reads better on it. */
private fun onAccent(c: Color): Color = if (c.luminance() > 0.36f) GROUND else TEXT

/** Shades a ground-tinted scrim, so overlays keep the world's green-black instead of plain black. */
private fun scrim(alpha: Float) = GROUND.copy(alpha = alpha)

// A 1080p TV is 960x540 dp; 5% of each edge stays clear because some TVs crop it.
private val SAFE_X = 48.dp
private val SAFE_Y = 27.dp
private val GAP = 16.dp
// Room on each side of a row so a focused tile's glow and zoom aren't clipped.
private val BLEED = 14.dp

/** Everything the layouts draw, worked out once from the apps on the TV and the settings. */
private class Home(apps: List<TvApp>, val cfg: HomeConfig) {
    private val byPkg = apps.associateBy { it.pkg }
    val shown = arrange(apps, cfg)
    private val inFolders = cfg.folders.flatMap { it.apps }.toSet()
    /** Apps placed freely, with where. They leave the dock and the grid only while the free section is on. */
    val free: List<Pair<TvApp, FreePos>> =
        if ("free" in cfg.sections) cfg.free.mapNotNull { f -> byPkg[f.pkg]?.takeIf { it.pkg !in cfg.hidden }?.let { it to f } } else emptyList()
    private val inFree = free.map { it.first.pkg }.toSet()
    val dock = shown.filter { it.pkg !in inFolders && it.pkg !in inFree }.take(cfg.dockSize)
    val grid = shown.filter { it.pkg !in inFolders && it.pkg !in inFree && it !in dock }
    val rows = cfg.rows.map { g -> g.name to g.apps.mapNotNull { byPkg[it] }.filter { it.pkg !in cfg.hidden } }.filter { it.second.isNotEmpty() }
    val folders = cfg.folders.map { g -> g.name to g.apps.mapNotNull { byPkg[it] } }.filter { it.second.isNotEmpty() }
    /** The tile that takes focus when Home opens, as "<section>:<package>" (an app can sit in two sections). */
    val first: String? = cfg.sections.firstNotNullOfOrNull { s ->
        when (s) {
            "dock" -> dock.firstOrNull()?.let { "dock:${it.pkg}" }
            "rows" -> rows.firstOrNull()?.second?.firstOrNull()?.let { "row0:${it.pkg}" }
            "free" -> free.firstOrNull()?.let { "free:${it.first.pkg}" }
            "grid" -> if (cfg.drawerOn) null else grid.firstOrNull()?.let { "grid:${it.pkg}" }
            else -> null
        }
    }
}

@Composable
fun HomeScreen(visualiser: Visualiser, appsVersion: Int, open: androidx.compose.runtime.MutableState<String?>) {
    val ctx = LocalContext.current
    val cfg by ConfigStore.config.collectAsState()
    val wallVersion by ConfigStore.wallpaperVersion.collectAsState()
    var apps by remember { mutableStateOf<List<TvApp>>(emptyList()) }
    var inputs by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    LaunchedEffect(appsVersion) {
        apps = withContext(Dispatchers.Default) { loadApps(ctx.packageManager, ctx.packageName) }
        inputs = withContext(Dispatchers.Default) { tvInputs(ctx) }
    }
    var wallpaper by remember { mutableStateOf<ImageBitmap?>(null) }
    LaunchedEffect(wallVersion) {
        wallpaper = withContext(Dispatchers.IO) {
            val f = ConfigStore.wallpaper(ctx)
            if (f.exists()) runCatching { BitmapFactory.decodeFile(f.path)?.asImageBitmap() }.getOrNull() else null
        }
    }
    LaunchedEffect(cfg.vizBars, cfg.vizSensitivity, cfg.visualiser) {
        visualiser.bars = cfg.vizBars
        visualiser.sensitivity = cfg.vizSensitivity / 100f
        if (cfg.visualiser) visualiser.start(ctx) else visualiser.stop()
    }

    val track by NowPlaying.track.collectAsState()
    var weather by remember { mutableStateOf<WeatherNow?>(null) }
    LaunchedEffect(cfg.weatherPlace, cfg.weatherLat, cfg.weatherLon, cfg.weatherUnit) {
        weather = null
        if (cfg.weatherPlace.isBlank()) return@LaunchedEffect
        // A failed refresh keeps the last reading; the next try is in 30 minutes, or 2 if there's none yet.
        while (true) {
            Weather.fetch(cfg)?.let { weather = it }
            delay(if (weather == null) 2 * 60_000L else 30 * 60_000L)
        }
    }

    val home = Home(apps, cfg)
    val accent = Color(cfg.accent)
    // Quick-settings icons this TV can actually open; Inputs only on TVs that have inputs.
    val all = remember { quickActions() }
    val quick = cfg.quick.mapNotNull { all[it] }.filter { canOpen(ctx, it, inputs.isNotEmpty()) }
    var openFolder by remember { mutableStateOf<Pair<String, List<TvApp>>?>(null) }
    var showInputs by remember { mutableStateOf(false) }
    var showDrawer by remember { mutableStateOf(false) }
    var showTune by remember { mutableStateOf(false) }
    LaunchedEffect(open.value) {
        if (open.value == "inputs") showInputs = true
        if (open.value == "drawer") showDrawer = true
        if (open.value == "tune") showTune = true
        open.value = null
    }
    val onQuick: (QuickAction) -> Unit = { a ->
        if (a.id == "inputs") showInputs = true
        else if (a.id == "drawer") showDrawer = true
        else if (a.id == "tune") showTune = true
        else if (a.id == "music") ConfigStore.update(ctx, org.json.JSONObject().put("visualiser", !cfg.visualiser))
        else resolve(ctx, a)?.let { i -> runCatching { ctx.startActivity(i) }.onFailure { Log.w(TAG, "${a.id}: $it") } }
    }
    val first = remember { FocusRequester() }
    LaunchedEffect(home.first, cfg.layout) { if (home.first != null) runCatching { first.requestFocus() } }
    val ui = Ui(cfg, accent, first, home.first, onFolder = { openFolder = it }, track = track, weather = weather)

    Box(Modifier.fillMaxSize().background(Color(cfg.background))) {
        wallpaper?.let {
            Image(it, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = cfg.wallpaperDim / 100f)))
        }
        // Rows sit over the lower half of the photo; a ground-tinted shade keeps their names readable.
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.35f to Color.Transparent, 1f to scrim(0.8f))))
        when (cfg.layout) {
            "split" -> SplitLayout(home, ui, quick, onQuick)
            "rail" -> RailLayout(home, ui, quick, onQuick)
            else -> ShelfLayout(home, ui, quick, onQuick)
        }
        if (cfg.visualiser) Bars(visualiser, cfg, accent, Modifier.align(Alignment.BottomCenter).fillMaxWidth())
        // The apps menu's handle: a button at the bottom the D-pad reaches by pressing down from the last row.
        if (cfg.drawerOn && cfg.drawerPill) DrawerPill(ui, Modifier.align(Alignment.BottomCenter).padding(bottom = SAFE_Y)) { showDrawer = true }
    }

    if (cfg.drawerOn && showDrawer) DrawerOverlay(home.shown, ui) { showDrawer = false }
    if (showTune) TuneOverlay(ui) { showTune = false }

    openFolder?.let { (name, list) -> FolderOverlay(name, list, ui) { openFolder = null } }
    if (showInputs) InputsOverlay(inputs, ui) { showInputs = false }
}

/** What every tile and section needs to know. */
private class Ui(
    val cfg: HomeConfig,
    val accent: Color,
    val focus: FocusRequester,
    val focusKey: String?,
    val onFolder: (Pair<String, List<TvApp>>) -> Unit,
    val track: Track? = null,
    val weather: WeatherNow? = null,
    /** Called as an app is opened from a tile; the drawer uses it to close itself first. */
    val onLaunch: () -> Unit = {},
) {
    fun focusFor(section: String, app: TvApp): Modifier = if ("$section:${app.pkg}" == focusKey) Modifier.focusRequester(focus) else Modifier
}

// ---- Layouts --------------------------------------------------------------------------------------

/** Shelf: a slim top bar, open wallpaper above the apps, the sections below. */
@Composable
private fun ShelfLayout(home: Home, ui: Ui, quick: List<QuickAction>, onQuick: (QuickAction) -> Unit) {
    val cfg = ui.cfg
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(scrim(0.6f), Color.Transparent), endY = 420f)))
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val open = maxHeight * (cfg.topSpace / 100f)
        Column(Modifier.fillMaxSize()) {
            // Greeting on the left; on the right the clock, the date, and the quick-settings icons under them.
            Row(Modifier.fillMaxWidth().padding(start = SAFE_X, end = SAFE_X, top = SAFE_Y), verticalAlignment = Alignment.Top) {
                Box(Modifier.padding(top = 4.dp)) { Greeting(cfg, 20.sp) }
                Spacer(Modifier.weight(1f))
                Column(horizontalAlignment = Alignment.End) {
                    Clock(cfg, 26.sp, 12.sp, Alignment.End)
                    WeatherLine(ui, 13.sp, Modifier.padding(top = 4.dp))
                    if (quick.isNotEmpty()) {
                        if (cfg.clock != "off") Spacer(Modifier.height(10.dp))
                        Row(Modifier.focusGroup(), horizontalArrangement = Arrangement.spacedBy(10.dp)) { quick.forEach { QuickButton(it, ui, onQuick) } }
                    }
                }
            }
            Sections(home, ui, Modifier.fillMaxSize(), PaddingValues(start = SAFE_X - BLEED, end = SAFE_X - BLEED, top = open, bottom = 96.dp), dockWidth = 200.dp)
        }
    }
}

/** Split: the time, greeting and quick settings hold the left third; the apps scroll on the right. */
@Composable
private fun SplitLayout(home: Home, ui: Ui, quick: List<QuickAction>, onQuick: (QuickAction) -> Unit) {
    val cfg = ui.cfg
    Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(listOf(scrim(0.7f), Color.Transparent), endX = 900f)))
    Row(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxWidth(0.32f).fillMaxHeight().padding(start = SAFE_X, top = SAFE_Y + 24.dp, bottom = SAFE_Y + 48.dp)) {
            // 46 sp keeps "12:51 PM" on one line in the left third; 12-hour time is the widest.
            Clock(cfg, 46.sp, 15.sp, Alignment.Start)
            WeatherLine(ui, 15.sp, Modifier.padding(top = 6.dp))
            Spacer(Modifier.height(14.dp))
            Greeting(cfg, 18.sp)
            Spacer(Modifier.weight(1f))
            Column(Modifier.focusGroup(), verticalArrangement = Arrangement.spacedBy(6.dp)) { quick.forEach { QuickRow(it, ui, onQuick, expanded = true) } }
        }
        Sections(home, ui, Modifier.fillMaxSize(), PaddingValues(start = 0.dp, end = SAFE_X - BLEED, top = SAFE_Y + 12.dp, bottom = 96.dp), dockWidth = 168.dp)
    }
}

/** Rail: icons down the left edge that widen with labels when focus moves onto them. */
@Composable
private fun RailLayout(home: Home, ui: Ui, quick: List<QuickAction>, onQuick: (QuickAction) -> Unit) {
    val cfg = ui.cfg
    var railFocused by remember { mutableStateOf(false) }
    // Icons start at the 48 dp safe edge; only the rail's shade runs to the screen edge.
    val railW by animateDpAsState(if (railFocused) 260.dp else SAFE_X + 56.dp, tween(220), label = "rail")
    Row(Modifier.fillMaxSize()) {
        Column(
            Modifier.width(railW).fillMaxHeight()
                .background(Brush.horizontalGradient(listOf(scrim(if (railFocused) 0.92f else 0.6f), scrim(if (railFocused) 0.75f else 0.1f))))
                .padding(start = SAFE_X - 4.dp, top = SAFE_Y + 8.dp, end = 8.dp)
                .onFocusChanged { railFocused = it.hasFocus }
                .focusGroup(),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            quick.forEach { QuickRow(it, ui, onQuick, expanded = railFocused) }
            if (home.folders.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                home.folders.forEach { f ->
                    RailItem(Icons.Outlined.Folder, f.first, ui, railFocused) { ui.onFolder(f) }
                }
            }
        }
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(start = 24.dp, end = SAFE_X, top = SAFE_Y), verticalAlignment = Alignment.CenterVertically) {
                Greeting(cfg, 20.sp)
                Spacer(Modifier.weight(1f))
                WeatherLine(ui, 13.sp, Modifier.padding(end = 18.dp))
                Clock(cfg, 26.sp, 12.sp, Alignment.End)
            }
            Sections(home, ui, Modifier.fillMaxSize(), PaddingValues(start = 24.dp - BLEED, end = SAFE_X - BLEED, top = 20.dp, bottom = 96.dp), dockWidth = 196.dp, showFolders = false)
        }
    }
}

// ---- Sections -------------------------------------------------------------------------------------

@Composable
private fun Sections(home: Home, ui: Ui, modifier: Modifier, padding: PaddingValues, dockWidth: Dp, showFolders: Boolean = true) {
    val cfg = ui.cfg
    BoxWithConstraints(modifier) {
        val inner = maxWidth - padding.calcHorizontal() - BLEED * 2
        val gridW: Dp = (inner - GAP * (cfg.columns - 1)) / cfg.columns
        // The default dock fits the screen; a bigger dock size scrolls sideways instead of shrinking past this.
        val n = home.dock.size.coerceIn(1, 5)
        val dockW: Dp = minOf(dockWidth * (cfg.dockScale / 100f), (inner - GAP * (n - 1)) / n)
        LazyColumn(Modifier.fillMaxSize().fadeTop(), contentPadding = padding) {
            for (s in cfg.sections) when (s) {
                "nowplaying" -> ui.track?.let { t -> item("nowplaying") { NowPlayingCard(t, ui) } }
                "dock" -> if (home.dock.isNotEmpty()) item("dock") {
                    TileRow("dock", home.dock, ui, dockW, big = true)
                }
                "rows" -> home.rows.forEachIndexed { i, (name, list) ->
                    item("row$i-title") { SectionTitle(name) }
                    item("row$i") { TileRow("row$i", list, ui, 148.dp * (cfg.tileScale / 100f), big = false) }
                }
                "folders" -> if (showFolders && home.folders.isNotEmpty()) {
                    item("folders-title") { SectionTitle(Words.tr(cfg, "Folders")) }
                    item("folders") {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(GAP), contentPadding = PaddingValues(horizontal = BLEED, vertical = 12.dp)) {
                            items(home.folders, key = { it.first }) { f -> FolderTile(f, ui, Modifier.width(148.dp * (cfg.tileScale / 100f))) }
                        }
                    }
                }
                "free" -> if (home.free.isNotEmpty()) item("free") { FreeCanvas(home.free, ui, maxHeight * (cfg.freeHeight / 100f)) }
                "grid" -> if (!cfg.drawerOn && home.grid.isNotEmpty()) grid(home, ui, gridW)
            }
        }
    }
}

/** Rows scrolling up fade out over the top 28 dp instead of being sliced by a hard edge. */
private fun Modifier.fadeTop(): Modifier = graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen).drawWithContent {
    drawContent()
    drawRect(Brush.verticalGradient(0f to Color.Transparent, 1f to Color.Black, endY = 28.dp.toPx()), blendMode = BlendMode.DstIn)
}

private fun PaddingValues.calcHorizontal(): Dp =
    calculateLeftPadding(androidx.compose.ui.unit.LayoutDirection.Ltr) + calculateRightPadding(androidx.compose.ui.unit.LayoutDirection.Ltr)

private fun LazyListScope.grid(home: Home, ui: Ui, w: Dp) {
    val label = if (home.dock.isEmpty() && home.rows.isEmpty()) "Apps" else "All apps"
    item("grid-title") { SectionTitle(Words.tr(ui.cfg, label)) }
    home.grid.chunked(ui.cfg.columns).forEachIndexed { i, row ->
        item("grid$i") {
            Row(Modifier.padding(horizontal = BLEED, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(GAP)) {
                for (app in row) Tile("grid", app, ui, Modifier.width(w), big = false)
            }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, color = TEXT, fontSize = 18.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = BLEED, top = 12.dp))
}

@Composable
private fun TileRow(section: String, list: List<TvApp>, ui: Ui, w: Dp, big: Boolean) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(GAP), contentPadding = PaddingValues(horizontal = BLEED, vertical = 12.dp)) {
        items(list, key = { it.pkg }) { app -> Tile(section, app, ui, Modifier.width(w), big) }
    }
}

// ---- Tiles ----------------------------------------------------------------------------------------

@Composable
private fun focusStyle(ui: Ui, shape: RoundedCornerShape, zoom: Float = 1.08f) = Triple(
    ClickableSurfaceDefaults.scale(focusedScale = if (ui.cfg.focus == "none") 1f else zoom),
    ClickableSurfaceDefaults.glow(focusedGlow = if (ui.cfg.focus == "glow") Glow(ui.accent, 16.dp) else Glow.None),
    ClickableSurfaceDefaults.border(
        focusedBorder = when (ui.cfg.focus) {
            "outline" -> Border(BorderStroke(3.dp, ui.accent), shape = shape)
            "glow" -> Border(BorderStroke(2.dp, TEXT), shape = shape) // a light ring that reads on any banner
            else -> Border.None
        }
    ),
)

@Composable
private fun Tile(section: String, app: TvApp, ui: Ui, size: Modifier, big: Boolean) {
    val ctx = LocalContext.current
    val shape = RoundedCornerShape(if (big) 12.dp else 10.dp)
    val (scale, glow, border) = focusStyle(ui, shape)
    Column(size) {
        Surface(
            onClick = { ui.onLaunch(); runCatching { ctx.startActivity(app.launch) }.onFailure { Log.w(TAG, "launch ${app.pkg}: $it") } },
            modifier = ui.focusFor(section, app).fillMaxWidth().aspectRatio(16f / 9f),
            shape = ClickableSurfaceDefaults.shape(shape), scale = scale, glow = glow, border = border,
            colors = ClickableSurfaceDefaults.colors(containerColor = TILE, focusedContainerColor = TILE_FOCUSED)
        ) {
            if (app.banner) {
                Image(app.art, app.label, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            } else {
                Column(Modifier.fillMaxSize().padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Image(app.art, null, Modifier.size(if (big) 40.dp else 32.dp))
                    if (!ui.cfg.showNames) {
                        Spacer(Modifier.height(4.dp))
                        Text(app.label, color = TEXT, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        if (ui.cfg.showNames) {
            Text(app.label, color = TEXT, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 7.dp, start = 2.dp))
        }
    }
}

/** A folder: a 2x2 peek at its apps, the name underneath. OK opens it over the home screen. */
@Composable
private fun FolderTile(folder: Pair<String, List<TvApp>>, ui: Ui, size: Modifier) {
    val shape = RoundedCornerShape(10.dp)
    val (scale, glow, border) = focusStyle(ui, shape)
    Column(size) {
        Surface(
            onClick = { ui.onFolder(folder) },
            modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
            shape = ClickableSurfaceDefaults.shape(shape), scale = scale, glow = glow, border = border,
            colors = ClickableSurfaceDefaults.colors(containerColor = TILE, focusedContainerColor = TILE_FOCUSED)
        ) {
            Column(Modifier.fillMaxSize().padding(8.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                folder.second.take(4).chunked(2).forEach { pair ->
                    Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        pair.forEach { app ->
                            Image(app.art, null, Modifier.weight(1f).fillMaxHeight().background(Color.Black.copy(alpha = 0.25f), RoundedCornerShape(5.dp)), contentScale = if (app.banner) ContentScale.Crop else ContentScale.Fit)
                        }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
        Text("${folder.first} · ${folder.second.size}", color = TEXT, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 7.dp, start = 2.dp))
    }
}

/** What another app is playing, with play/pause and next. Only there while a session has something loaded. */
@Composable
private fun NowPlayingCard(t: Track, ui: Ui) {
    Row(
        Modifier.padding(horizontal = BLEED, vertical = 12.dp).width(520.dp).background(PANEL.copy(alpha = 0.88f), RoundedCornerShape(14.dp)).padding(12.dp).focusGroup(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(64.dp).background(TILE, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
            if (t.art != null) Image(t.art, null, Modifier.fillMaxSize().background(Color.Black, RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop)
            else Image(Icons.Outlined.MusicNote, null, Modifier.size(28.dp), colorFilter = ColorFilter.tint(MUTED))
        }
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Text(t.title, color = TEXT, fontSize = 17.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(listOf(t.artist, t.app).filter { it.isNotBlank() }.joinToString(" · "), color = MUTED, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 3.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            RoundButton(if (t.playing) Icons.Outlined.Pause else Icons.Outlined.PlayArrow, if (t.playing) "Pause" else "Play", ui) { NowPlaying.playPause() }
            RoundButton(Icons.Outlined.SkipNext, "Next", ui) { NowPlaying.next() }
        }
    }
}

// ---- Top bar pieces -------------------------------------------------------------------------------

/** Icon, temperature, today's high and low, and the place, in one muted line. */
@Composable
private fun WeatherLine(ui: Ui, size: androidx.compose.ui.unit.TextUnit, modifier: Modifier = Modifier) {
    val w = ui.weather ?: return
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Image(weatherIcon(w), null, Modifier.size(with(androidx.compose.ui.platform.LocalDensity.current) { size.toDp() * 1.3f }), colorFilter = ColorFilter.tint(MUTED))
        Spacer(Modifier.width(6.dp))
        Text("${w.temp}°  ${w.high}° / ${w.low}°  ${ui.cfg.weatherPlace}", color = MUTED, fontSize = size, fontFamily = CLOCK, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** WMO weather codes, as Open-Meteo reports them, to a drawn icon. */
private fun weatherIcon(w: WeatherNow): ImageVector = when (w.code) {
    0 -> if (w.day) Icons.Outlined.WbSunny else Icons.Outlined.NightsStay
    1, 2 -> if (w.day) Icons.Outlined.WbCloudy else Icons.Outlined.NightsStay
    3 -> Icons.Outlined.Cloud
    45, 48 -> Icons.Outlined.Dehaze
    in 71..77, 85, 86 -> Icons.Outlined.AcUnit
    in 95..99 -> Icons.Outlined.Thunderstorm
    in 51..67, in 80..82 -> Icons.Outlined.WaterDrop
    else -> Icons.Outlined.Cloud
}

@Composable
private fun RoundButton(icon: ImageVector, label: String, ui: Ui, onClick: () -> Unit) {
    val (scale, glow, border) = focusStyle(ui, RoundedCornerShape(50), zoom = 1.12f)
    var focused by remember { mutableStateOf(false) }
    Surface(
        onClick = onClick,
        modifier = Modifier.size(44.dp).onFocusChanged { focused = it.isFocused },
        shape = ClickableSurfaceDefaults.shape(CircleShape), scale = scale, glow = glow, border = border,
        colors = ClickableSurfaceDefaults.colors(containerColor = Color.White.copy(alpha = 0.08f), focusedContainerColor = ui.accent.copy(alpha = 0.9f))
    ) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Image(icon, label, Modifier.size(24.dp), colorFilter = ColorFilter.tint(if (focused) onAccent(ui.accent) else TEXT))
        }
    }
}

@Composable
private fun QuickButton(a: QuickAction, ui: Ui, onQuick: (QuickAction) -> Unit) {
    val (scale, glow, border) = focusStyle(ui, RoundedCornerShape(50), zoom = 1.12f)
    var focused by remember { mutableStateOf(false) }
    Surface(
        onClick = { onQuick(a) },
        modifier = Modifier.size(40.dp).onFocusChanged { focused = it.isFocused },
        shape = ClickableSurfaceDefaults.shape(CircleShape), scale = scale, glow = glow, border = border,
        colors = ClickableSurfaceDefaults.colors(containerColor = Color.White.copy(alpha = 0.08f), focusedContainerColor = ui.accent.copy(alpha = 0.9f))
    ) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Image(iconFor(a, ui.cfg), a.label, Modifier.size(22.dp), colorFilter = ColorFilter.tint(if (focused) onAccent(ui.accent) else TEXT))
        }
    }
}

@Composable
private fun QuickRow(a: QuickAction, ui: Ui, onQuick: (QuickAction) -> Unit, expanded: Boolean) =
    RailItem(iconFor(a, ui.cfg), Words.tr(ui.cfg, a.label), ui, expanded) { onQuick(a) }

@Composable
private fun RailItem(icon: ImageVector, label: String, ui: Ui, expanded: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(22.dp)
    val (_, glow, border) = focusStyle(ui, shape)
    var focused by remember { mutableStateOf(false) }
    val ink = if (focused) onAccent(ui.accent) else TEXT
    Surface(
        onClick = onClick,
        modifier = Modifier.height(44.dp).then(if (expanded) Modifier.fillMaxWidth() else Modifier.width(44.dp)).onFocusChanged { focused = it.isFocused },
        shape = ClickableSurfaceDefaults.shape(shape), scale = ClickableSurfaceDefaults.scale(focusedScale = 1.04f), glow = glow, border = border,
        colors = ClickableSurfaceDefaults.colors(containerColor = Color.Transparent, focusedContainerColor = ui.accent.copy(alpha = 0.9f))
    ) {
        Row(Modifier.fillMaxSize().padding(horizontal = 11.dp), verticalAlignment = Alignment.CenterVertically) {
            Image(icon, label, Modifier.size(22.dp), colorFilter = ColorFilter.tint(ink))
            if (expanded) {
                Spacer(Modifier.width(14.dp))
                Text(label, color = ink, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun Greeting(cfg: HomeConfig, size: androidx.compose.ui.unit.TextUnit) {
    if (cfg.greeting.isBlank()) return
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    val part = Words.tr(cfg, when (hour) { in 5..11 -> "Good morning"; in 12..17 -> "Good afternoon"; else -> "Good evening" })
    Text("$part, ${cfg.greeting}", color = TEXT, fontSize = size, fontWeight = FontWeight.Medium, maxLines = 2)
}

@Composable
private fun Clock(cfg: HomeConfig, timeSize: androidx.compose.ui.unit.TextUnit, dateSize: androidx.compose.ui.unit.TextUnit, align: Alignment.Horizontal) {
    if (cfg.clock == "off") return
    var now by remember { mutableStateOf(Date()) }
    LaunchedEffect(Unit) { while (true) { now = Date(); delay(1000L - System.currentTimeMillis() % 1000) } }
    Column(horizontalAlignment = align) {
        Text(DateFormat.getTimeInstance(DateFormat.SHORT).format(now), color = TEXT, fontSize = timeSize, fontFamily = CLOCK, fontWeight = FontWeight.Light, maxLines = 1, softWrap = false)
        if (cfg.clock == "time_date") Text(DateFormat.getDateInstance(DateFormat.FULL).format(now), color = MUTED, fontSize = dateSize, fontFamily = CLOCK)
    }
}

// ---- Free placement and the apps menu -------------------------------------------------------------

/**
 * Apps put wherever the desktop editor left them. x and y are percent of the room the tile has (0 is the
 * left or top edge, 100 the right or bottom edge), so a tile never leaves the canvas whatever its size.
 */
@Composable
private fun FreeCanvas(placed: List<Pair<TvApp, FreePos>>, ui: Ui, height: Dp) {
    val cfg = ui.cfg
    BoxWithConstraints(Modifier.fillMaxWidth().height(height).focusGroup()) {
        val tileW = 120.dp * (cfg.freeScale / 100f)
        // The picture is 16:9; the name under it takes about 26 dp.
        val tileH = tileW * 9f / 16f + if (cfg.showNames) 26.dp else 0.dp
        for ((app, pos) in placed) {
            val x = maxOf(0.dp, maxWidth - BLEED * 2 - tileW) * (pos.x / 100f) + BLEED
            val y = maxOf(0.dp, height - tileH) * (pos.y / 100f)
            Box(Modifier.offset(x, y)) { Tile("free", app, ui, Modifier.width(tileW), big = false) }
        }
    }
}

/** The handle of the apps menu: one button at the bottom of the screen. */
@Composable
private fun DrawerPill(ui: Ui, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(50)
    val (scale, glow, border) = focusStyle(ui, shape, zoom = 1.06f)
    var focused by remember { mutableStateOf(false) }
    val ink = if (focused) onAccent(ui.accent) else TEXT
    Surface(
        onClick = onClick,
        modifier = modifier.height(40.dp).onFocusChanged { focused = it.isFocused },
        shape = ClickableSurfaceDefaults.shape(shape), scale = scale, glow = glow, border = border,
        colors = ClickableSurfaceDefaults.colors(containerColor = scrim(0.7f), focusedContainerColor = ui.accent.copy(alpha = 0.9f))
    ) {
        Row(Modifier.padding(horizontal = 20.dp).fillMaxHeight(), verticalAlignment = Alignment.CenterVertically) {
            Image(Icons.Outlined.GridView, null, Modifier.size(20.dp), colorFilter = ColorFilter.tint(ink))
            Spacer(Modifier.width(10.dp))
            Text(Words.tr(ui.cfg, "All apps"), color = ink, fontSize = 15.sp)
        }
    }
}

/**
 * Every app in one panel that opens over the home screen: from the bottom, from the right, or full screen.
 * Back closes it, so does opening an app, and so can a quiet spell (`drawerAutoclose`).
 */
@Composable
private fun DrawerOverlay(apps: List<TvApp>, ui: Ui, onClose: () -> Unit) {
    val cfg = ui.cfg
    val focus = remember { FocusRequester() }
    // Any button press restarts the quiet-spell clock.
    var lastKey by remember { mutableStateOf(0L) }
    LaunchedEffect(lastKey, cfg.drawerAutoclose) {
        if (cfg.drawerAutoclose > 0) {
            delay(cfg.drawerAutoclose * 1000L)
            onClose()
        }
    }
    val side = cfg.drawerStyle == "side"
    val full = cfg.drawerStyle == "full"
    val cols = if (side) minOf(cfg.drawerColumns, 3) else cfg.drawerColumns
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            Modifier.fillMaxSize().background(scrim(cfg.drawerDim / 100f)).onPreviewKeyEvent { lastKey = System.nanoTime(); false },
            contentAlignment = when {
                side -> Alignment.CenterEnd
                full -> Alignment.Center
                else -> Alignment.BottomCenter
            },
        ) {
            val panel = when {
                side -> Modifier.fillMaxHeight().width(440.dp)
                full -> Modifier.fillMaxSize()
                else -> Modifier.fillMaxWidth().fillMaxHeight(0.62f)
            }
            val shape = when {
                side -> RoundedCornerShape(topStart = 16.dp, bottomStart = 16.dp)
                full -> RoundedCornerShape(0.dp)
                else -> RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
            }
            Column(panel.background(PANEL.copy(alpha = 0.97f), shape).padding(start = SAFE_X - BLEED, end = SAFE_X - BLEED, top = 20.dp)) {
                Text(Words.tr(cfg, "All apps"), color = TEXT, fontSize = 22.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = BLEED, bottom = 4.dp))
                BoxWithConstraints(Modifier.weight(1f)) {
                    val w: Dp = (maxWidth - BLEED * 2 - GAP * (cols - 1)) / cols
                    val inner = Ui(cfg, ui.accent, focus, apps.firstOrNull()?.let { "drawer:${it.pkg}" }, ui.onFolder, onLaunch = onClose)
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                        apps.chunked(cols).forEachIndexed { i, row ->
                            item("drawer$i") {
                                Row(Modifier.padding(horizontal = BLEED, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(GAP)) {
                                    for (app in row) Tile("drawer", app, inner, Modifier.width(w), big = false)
                                }
                            }
                        }
                    }
                }
            }
        }
        LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    }
}

// ---- Home settings pop-up -------------------------------------------------------------------------

/** One line of the settings pop-up: what it is, what it is now, and what Left/Right (dir -1/+1) or OK (+1) does. */
private class Tune(val label: String, val value: String, val change: (Int) -> Unit)

private val ACCENT_CHOICES = listOf(0xFF4CAF50, 0xFFFF3000, 0xFF2EC4B6, 0xFFFFB23C, 0xFF7C5CFF, 0xFFFFFFFF)

/**
 * Home's own settings, on the TV: Menu on the remote (or the Home settings icon) opens them over the home
 * screen, and every change shows behind at once and is saved like one made from the desktop app.
 * Left and Right (or OK) step a value; Back closes.
 */
@Composable
private fun TuneOverlay(ui: Ui, onClose: () -> Unit) {
    val ctx = LocalContext.current
    val cfg = ui.cfg
    val focus = remember { FocusRequester() }
    fun put(key: String, value: Any) { ConfigStore.update(ctx, org.json.JSONObject().put(key, value)) }
    fun <T> cycle(list: List<T>, cur: T, dir: Int): T = list[((list.indexOf(cur).takeIf { it >= 0 } ?: 0) + dir + list.size) % list.size]
    fun step(cur: Int, dir: Int, lo: Int, hi: Int, by: Int) = (cur + dir * by).coerceIn(lo, hi)
    fun onOff(b: Boolean) = if (b) "On" else "Off"
    fun word(s: String) = s.replace('_', ' ').replaceFirstChar { it.uppercase() }
    val freeOn = "free" in cfg.sections
    val rows = listOf(
        Tune("Layout", word(cfg.layout)) { put("layout", cycle(listOf("shelf", "split", "rail"), cfg.layout, it)) },
        Tune("Accent colour", "#%06X".format(cfg.accent and 0xFFFFFF)) { d ->
            put("accent", "#%06X".format(cycle(ACCENT_CHOICES, ACCENT_CHOICES.firstOrNull { it == cfg.accent } ?: ACCENT_CHOICES[0], d) and 0xFFFFFF))
        },
        Tune("Focus style", word(cfg.focus)) { put("focus", cycle(listOf("glow", "outline", "none"), cfg.focus, it)) },
        Tune("App names", onOff(cfg.showNames)) { put("show_names", !cfg.showNames) },
        Tune("Clock", word(cfg.clock)) { put("clock", cycle(listOf("time_date", "time", "off"), cfg.clock, it)) },
        Tune("Dock size", "${cfg.dockSize}") { put("dock_size", step(cfg.dockSize, it, 0, 8, 1)) },
        Tune("Row and folder tiles", "${cfg.tileScale}%") { put("tile_scale", step(cfg.tileScale, it, 60, 150, 10)) },
        Tune("Apps per row", "${cfg.columns}") { put("columns", step(cfg.columns, it, 3, 8, 1)) },
        Tune("Free area", onOff(freeOn)) {
            val s = cfg.sections
            val next = if (freeOn) s - "free" else s.indexOf("grid").let { i -> if (i < 0) s + "free" else s.take(i) + "free" + s.drop(i) }
            put("sections", org.json.JSONArray(next))
        },
        Tune("Free area tile size", "${cfg.freeScale}%") { put("free_scale", step(cfg.freeScale, it, 60, 200, 10)) },
        Tune("All apps in a menu", onOff(cfg.drawerOn)) { put("drawer_on", !cfg.drawerOn) },
        Tune("Menu style", word(cfg.drawerStyle)) { put("drawer_style", cycle(listOf("sheet", "side", "full"), cfg.drawerStyle, it)) },
        Tune("Wallpaper shade", "${cfg.wallpaperDim}%") { put("wallpaper_dim", step(cfg.wallpaperDim, it, 0, 80, 5)) },
        Tune("Music bars", onOff(cfg.visualiser)) { put("visualiser", !cfg.visualiser) },
    )
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(scrim(0.55f)), contentAlignment = Alignment.CenterEnd) {
            Column(Modifier.padding(end = SAFE_X).width(460.dp).fillMaxHeight(0.86f).background(PANEL.copy(alpha = 0.97f), RoundedCornerShape(16.dp)).padding(20.dp)) {
                Text(Words.tr(cfg, "Home settings"), color = TEXT, fontSize = 22.sp, fontWeight = FontWeight.Medium)
                Text(Words.tr(cfg, "Left and Right change a value, OK steps it. Back closes."), color = MUTED, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp, bottom = 10.dp))
                LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp), contentPadding = PaddingValues(vertical = 4.dp)) {
                    items(rows.size) { i ->
                        val t = rows[i]
                        val shape = RoundedCornerShape(12.dp)
                        val (scale, glow, border) = focusStyle(ui, shape, zoom = 1.02f)
                        Surface(
                            onClick = { t.change(1) },
                            modifier = (if (i == 0) Modifier.focusRequester(focus) else Modifier).fillMaxWidth().height(48.dp).onPreviewKeyEvent { e ->
                                if (e.type == KeyEventType.KeyDown && (e.key == Key.DirectionLeft || e.key == Key.DirectionRight)) {
                                    t.change(if (e.key == Key.DirectionRight) 1 else -1)
                                    true
                                } else false
                            },
                            shape = ClickableSurfaceDefaults.shape(shape), scale = scale, glow = glow, border = border,
                            colors = ClickableSurfaceDefaults.colors(containerColor = TILE, focusedContainerColor = TILE_FOCUSED)
                        ) {
                            Row(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(Words.tr(cfg, t.label), color = TEXT, fontSize = 16.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("\u2039  ${Words.tr(cfg, t.value)}  \u203A", color = MUTED, fontSize = 15.sp, maxLines = 1)
                            }
                        }
                    }
                }
            }
        }
        LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    }
}

// ---- Overlays -------------------------------------------------------------------------------------

/** A folder's apps over a dimmed home screen. Back closes it. */
@Composable
private fun FolderOverlay(name: String, list: List<TvApp>, ui: Ui, onClose: () -> Unit) {
    val focus = remember { FocusRequester() }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(scrim(0.9f)), contentAlignment = Alignment.Center) {
            Column(Modifier.background(PANEL, RoundedCornerShape(16.dp)).padding(horizontal = 20.dp, vertical = 18.dp)) {
                Text(name, color = TEXT, fontSize = 24.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = BLEED, bottom = 6.dp))
                val inner = Ui(ui.cfg, ui.accent, focus, list.firstOrNull()?.let { "folder:${it.pkg}" }, ui.onFolder)
                list.chunked(5).forEach { row ->
                    Row(Modifier.padding(horizontal = BLEED, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(GAP)) {
                        for (app in row) Tile("folder", app, inner, Modifier.width(148.dp), big = false)
                    }
                }
            }
        }
        LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    }
}

@Composable
private fun InputsOverlay(inputs: List<Pair<String, String>>, ui: Ui, onClose: () -> Unit) {
    val ctx = LocalContext.current
    val focus = remember { FocusRequester() }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(scrim(0.9f)), contentAlignment = Alignment.Center) {
            Column(Modifier.width(400.dp).background(PANEL, RoundedCornerShape(16.dp)).padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(Words.tr(ui.cfg, "Inputs"), color = TEXT, fontSize = 24.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 6.dp))
                inputs.forEachIndexed { i, (id, label) ->
                    val shape = RoundedCornerShape(12.dp)
                    val (scale, glow, border) = focusStyle(ui, shape, zoom = 1.03f)
                    Surface(
                        onClick = { onClose(); openInput(ctx, id) },
                        modifier = (if (i == 0) Modifier.focusRequester(focus) else Modifier).fillMaxWidth().height(52.dp),
                        shape = ClickableSurfaceDefaults.shape(shape), scale = scale, glow = glow, border = border,
                        colors = ClickableSurfaceDefaults.colors(containerColor = TILE, focusedContainerColor = TILE_FOCUSED)
                    ) {
                        Box(Modifier.fillMaxSize().padding(horizontal = 18.dp), contentAlignment = Alignment.CenterStart) {
                            Text(label, color = TEXT, fontSize = 17.sp)
                        }
                    }
                }
            }
        }
        LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    }
}
