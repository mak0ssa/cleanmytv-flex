package io.github.wingedpanther.cleanmytv.home

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

/** The weather now, in the unit the desktop app chose. `code` is a WMO weather code. */
/** One day of the forecast: `dow` is the short weekday name in the TV's chosen language. */
data class DayForecast(val dow: String, val code: Int, val high: Int, val low: Int)

data class WeatherNow(
    val temp: Int, val code: Int, val day: Boolean, val high: Int, val low: Int,
    val feels: Int = temp, val humidity: Int = 0, val wind: Int = 0, val days: List<DayForecast> = emptyList(),
    /** Where the reading came from, shown under the place name. */
    val source: String = "",
)

/** A reading, or the short reason there is none (an HTTP status or the kind of network error), shown on the TV. */
data class WeatherResult(val now: WeatherNow?, val error: String? = null)

/** Open-Meteo: free, no key, no account. One small request every 30 minutes while Home is open. */
object Weather {
    /** Tries the chosen source, then the other; the reason both failed is shown on the TV. */
    suspend fun fetch(cfg: HomeConfig): WeatherResult {
        val order = if (cfg.weatherSource == "openmeteo") listOf("openmeteo", "yandex") else listOf("yandex", "openmeteo")
        val reasons = ArrayList<String>()
        for (source in order) {
            val r = if (source == "yandex") fetchYandex(cfg) else fetchOpenMeteo(cfg)
            if (r.now != null) return r
            reasons += (if (source == "yandex") "Яндекс: " else "Open-Meteo: ") + (r.error ?: "нет данных")
        }
        return WeatherResult(null, reasons.joinToString("; "))
    }

    private suspend fun fetchOpenMeteo(cfg: HomeConfig): WeatherResult = withContext(Dispatchers.IO) {
        val url = String.format(
            Locale.US,
            "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&current=temperature_2m,weather_code,is_day,apparent_temperature,relative_humidity_2m,wind_speed_10m" +
                "&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=5&wind_speed_unit=ms&timezone=auto&temperature_unit=%s",
            cfg.weatherLat, cfg.weatherLon, if (cfg.weatherUnit == "f") "fahrenheit" else "celsius",
        )
        runCatching {
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 10_000
            conn.readTimeout = 10_000
            try {
                if (conn.responseCode != 200) return@runCatching WeatherResult(null, "HTTP ${conn.responseCode}")
                val o = JSONObject(conn.inputStream.bufferedReader().use { it.readText().take(64_000) })
                val now = o.getJSONObject("current")
                val daily = o.getJSONObject("daily")
                WeatherResult(WeatherNow(
                    temp = Math.round(now.getDouble("temperature_2m")).toInt(),
                    code = now.getInt("weather_code"),
                    day = now.optInt("is_day", 1) == 1,
                    high = Math.round(daily.getJSONArray("temperature_2m_max").getDouble(0)).toInt(),
                    low = Math.round(daily.getJSONArray("temperature_2m_min").getDouble(0)).toInt(),
                    feels = Math.round(now.optDouble("apparent_temperature", now.getDouble("temperature_2m"))).toInt(),
                    humidity = Math.round(now.optDouble("relative_humidity_2m", 0.0)).toInt(),
                    wind = Math.round(now.optDouble("wind_speed_10m", 0.0)).toInt(),
                    days = forecast(daily, cfg),
                    source = "Open-Meteo",
                ))
            } finally {
                conn.disconnect()
            }
        }.onFailure { Log.i(TAG, "weather: $it") }.getOrElse { WeatherResult(null, it.javaClass.simpleName) }
    }

    /** The days after the first, with a short weekday name; a day the service left out is skipped. */
    private fun forecast(daily: JSONObject, cfg: HomeConfig): List<DayForecast> = runCatching {
        val times = daily.getJSONArray("time")
        val codes = daily.getJSONArray("weather_code")
        val highs = daily.getJSONArray("temperature_2m_max")
        val lows = daily.getJSONArray("temperature_2m_min")
        val parse = java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val name = java.text.SimpleDateFormat("EEE", if (Words.ru(cfg)) Locale("ru") else Locale.ENGLISH)
        (0 until times.length()).mapNotNull { i ->
            val d = parse.parse(times.getString(i)) ?: return@mapNotNull null
            DayForecast(name.format(d).replaceFirstChar { it.uppercase() }, codes.optInt(i, 3), Math.round(highs.getDouble(i)).toInt(), Math.round(lows.getDouble(i)).toInt())
        }
    }.getOrDefault(emptyList())

    private const val UA = "Mozilla/5.0 (Linux; Android 10; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

    /**
     * Yandex.Pogoda's own page for the chosen coordinates, read as text: the page spells the weather out in a
     * sentence ("Температура воздуха +5°, ощущается как +1°. Скорость ветра 3 м/с ... Влажность 75%"), and lists the
     * next days as "вс01.11 +8° 0°". The page is for people, so this can stop working when Yandex changes it, and
     * Yandex may show a captcha instead; either way the other source takes over.
     */
    private suspend fun fetchYandex(cfg: HomeConfig): WeatherResult = withContext(Dispatchers.IO) {
        runCatching {
            val url = String.format(Locale.US, "https://yandex.ru/pogoda/ru/yekaterinburg?lat=%.5f&lon=%.5f", cfg.weatherLat, cfg.weatherLon)
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 10_000
            conn.readTimeout = 15_000
            conn.setRequestProperty("User-Agent", UA)
            conn.setRequestProperty("Accept-Language", "ru,en;q=0.8")
            try {
                if (conn.responseCode != 200) return@runCatching WeatherResult(null, "HTTP ${conn.responseCode}")
                val html = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText().take(2_000_000) }
                parseYandex(html, cfg) ?: WeatherResult(null, if ("captcha" in html.lowercase()) "капча" else "данные не найдены")
            } finally {
                conn.disconnect()
            }
        }.onFailure { Log.i(TAG, "yandex weather: $it") }.getOrElse { WeatherResult(null, it.javaClass.simpleName) }
    }

    private val INVISIBLE = Regex("[\\u200B-\\u200F\\u2060\\uFEFF\\u00A0]")
    private val NOW = Regex("""Температура воздуха\s*([+\-]?\d+)\s*°,?\s*ощущается как\s*([+\-]?\d+)\s*°.{0,80}?Скорость ветра\s*([\d.,]+)\s*м/с.{0,160}?Влажность\s*(\d+)\s*%""", RegexOption.DOT_MATCHES_ALL)
    private val SKY = Regex("""погода сейчас:\s*([^.]{2,60})\.""", RegexOption.IGNORE_CASE)
    private val TODAY = Regex("""Сегодня:\s*([+\-]?\d+)\s*…\s*([+\-]?\d+)\s*°""")
    private val DAY = Regex("""(пн|вт|ср|чт|пт|сб|вс)\s?(\d{2}(?:\.\d{2})?)\s*([+\-]?\d+)\s*°\s*([+\-]?\d+)\s*°""")

    internal fun parseYandex(html: String, cfg: HomeConfig): WeatherResult? {
        val body = html.replace(Regex("(?is)<(script|style)[^>]*>.*?</\\1>"), " ").replace(Regex("<[^>]*>"), " ")
        @Suppress("DEPRECATION")
        val decoded = if (android.os.Build.VERSION.SDK_INT >= 24) android.text.Html.fromHtml(body, android.text.Html.FROM_HTML_MODE_LEGACY).toString() else android.text.Html.fromHtml(body).toString()
        val text = decoded.replace(INVISIBLE, " ").replace('\u2212', '-').replace(Regex("\\s+"), " ")
        val m = NOW.find(text) ?: return null
        val f = cfg.weatherUnit == "f"
        fun deg(c: String): Int { val v = c.toDouble(); return Math.round(if (f) v * 9 / 5 + 32 else v).toInt() }
        val temp = deg(m.groupValues[1])
        val sky = SKY.find(text)?.groupValues?.get(1)?.trim().orEmpty()
        val code = yandexCode(sky)
        val today = TODAY.find(text)
        val low = today?.groupValues?.get(1)?.let { deg(it) } ?: temp
        val high = today?.groupValues?.get(2)?.let { deg(it) } ?: temp
        val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
        val seen = HashSet<String>()
        val next = DAY.findAll(text).mapNotNull { d ->
            if (!seen.add(d.groupValues[1] + d.groupValues[2])) null
            else DayForecast(d.groupValues[1].replaceFirstChar { it.uppercase() }, -1, deg(d.groupValues[3]), deg(d.groupValues[4]))
        }.take(5).toList()
        return WeatherResult(
            WeatherNow(
                temp = temp, code = code, day = hour in 6..19, high = high, low = low,
                feels = deg(m.groupValues[2]), humidity = m.groupValues[4].toInt(), wind = Math.round(m.groupValues[3].replace(',', '.').toDouble()).toInt(),
                // The widget skips the first entry (today), so Yandex's list, which starts tomorrow, gets one placed in front.
                days = listOf(DayForecast("", code, high, low)) + next,
                source = "Яндекс.Погода",
            )
        )
    }

    /** Yandex's words for the sky to the WMO codes the icons and texts use. */
    private fun yandexCode(sky: String): Int {
        val s = sky.lowercase()
        return when {
            "гроз" in s -> 95
            "снег" in s && "дожд" in s -> 68
            "снег" in s -> 73
            "ливень" in s -> 81
            "дожд" in s || "морос" in s -> 63
            "туман" in s -> 45
            "пасмурно" in s -> 3
            "прояснени" in s -> 2
            "малооблачно" in s -> 1
            "облачно" in s -> 3
            "ясно" in s -> 0
            else -> 3
        }
    }
}
