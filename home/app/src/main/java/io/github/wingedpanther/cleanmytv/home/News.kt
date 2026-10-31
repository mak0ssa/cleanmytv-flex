package io.github.wingedpanther.cleanmytv.home

import android.text.Html
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/** One headline and the page it opens. */
data class Headline(val title: String, val url: String)

/** Headlines, or the short reason there are none, shown on the TV in place of them. */
data class NewsResult(val items: List<Headline>, val error: String? = null)

/**
 * Headlines from one web address. A feed (RSS or Atom) is read as a feed; any other page is read for the
 * links of the e1.ru article pattern (/text/<section>/YYYY/MM/DD/<number>/) with their link text, in page order.
 * One small request every `news_refresh` minutes while Home is open.
 */
object News {
    private const val UA = "Mozilla/5.0 (Linux; Android 10; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    private val ARTICLE = Regex("""<a\s[^>]*?href="([^"]*?/text/[a-z0-9-]+/\d{4}/\d{2}/\d{2}/\d+/?[^"]*)"[^>]*>(.*?)</a>""", setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE))
    private val RSS_ITEM = Regex("""<item[\s>].*?<title[^>]*>(.*?)</title>.*?<link[^>]*>(.*?)</link>""", setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE))
    private val ATOM_ENTRY = Regex("""<entry[\s>].*?<title[^>]*>(.*?)</title>.*?<link[^>]*?href="([^"]*)"""", setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE))

    suspend fun fetch(cfg: HomeConfig): NewsResult = withContext(Dispatchers.IO) {
        runCatching {
            val conn = URL(cfg.newsUrl).openConnection() as HttpURLConnection
            conn.connectTimeout = 10_000
            conn.readTimeout = 15_000
            conn.setRequestProperty("User-Agent", UA)
            conn.setRequestProperty("Accept-Language", "ru,en;q=0.8")
            try {
                if (conn.responseCode != 200) return@runCatching NewsResult(emptyList(), "HTTP ${conn.responseCode}")
                val text = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText().take(3_000_000) }
                val items = parse(text, cfg.newsUrl).take(cfg.newsCount)
                if (items.isEmpty()) NewsResult(emptyList(), "заголовки не найдены") else NewsResult(items)
            } finally {
                conn.disconnect()
            }
        }.onFailure { Log.i(TAG, "news: $it") }.getOrElse { NewsResult(emptyList(), it.javaClass.simpleName) }
    }

    internal fun parse(text: String, base: String): List<Headline> {
        val raw: List<Pair<String, String>> = when {
            "<rss" in text || "<channel" in text -> RSS_ITEM.findAll(text).map { it.groupValues[1] to it.groupValues[2] }.toList()
            "<feed" in text -> ATOM_ENTRY.findAll(text).map { it.groupValues[1] to it.groupValues[2] }.toList()
            else -> ARTICLE.findAll(text).map { it.groupValues[2] to it.groupValues[1] }.toList()
        }
        val seenUrls = HashSet<String>()
        val seenTitles = HashSet<String>()
        val out = ArrayList<Headline>()
        for ((rawTitle, rawUrl) in raw) {
            val title = clean(rawTitle)
            val url = absolute(clean(rawUrl), base) ?: continue
            if (title.length < 20 || title.length > 240 || title.startsWith("http")) continue
            if (!seenUrls.add(url.substringBefore('?')) || !seenTitles.add(title)) continue
            out += Headline(title, url)
        }
        return out
    }

    private fun clean(s: String): String {
        val noCdata = s.replace("<![CDATA[", "").replace("]]>", "")
        val noTags = noCdata.replace(Regex("<[^>]*>"), " ")
        @Suppress("DEPRECATION")
        val plain = if (android.os.Build.VERSION.SDK_INT >= 24) Html.fromHtml(noTags, Html.FROM_HTML_MODE_LEGACY).toString() else Html.fromHtml(noTags).toString()
        return plain.replace(Regex("\\s+"), " ").trim()
    }

    /** Only web addresses open: https, or a path on the page's own site. */
    private fun absolute(u: String, base: String): String? = runCatching {
        val abs = URL(URL(base), u).toString()
        if (abs.startsWith("https://")) abs else null
    }.getOrNull()
}
