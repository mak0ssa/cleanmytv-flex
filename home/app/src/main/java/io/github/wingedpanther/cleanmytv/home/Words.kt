package io.github.wingedpanther.cleanmytv.home

import java.util.Locale

/**
 * Home's own words. The English text in the code is the source; with the language on Russian (or on
 * "auto" while the TV itself is set to Russian) the same text is looked up here. A line with no entry stays
 * English, so a missing translation can never blank anything out.
 */
object Words {
    private val RU = mapOf(
        "All apps" to "Все приложения", "Apps" to "Приложения", "Folders" to "Папки", "Inputs" to "Входы",
        "Wi-Fi" to "Wi-Fi", "Bluetooth" to "Bluetooth", "Picture & sound" to "Изображение и звук", "Screensaver" to "Заставка",
        "Search" to "Поиск", "Music bars" to "Музыкальные полосы", "Settings" to "Настройки", "Home settings" to "Настройки главного экрана",
        "Good morning" to "Доброе утро", "Good afternoon" to "Добрый день", "Good evening" to "Добрый вечер",
        "Left and Right change a value, OK steps it. Back closes." to "Влево и вправо меняют значение, OK переключает дальше. «Назад» закрывает.",
        // Home settings pop-up: names and values
        "Layout" to "Макет", "Accent colour" to "Акцентный цвет", "Focus style" to "Стиль фокуса", "App names" to "Названия приложений",
        "Clock" to "Часы", "Dock size" to "Размер дока", "Row and folder tiles" to "Плитки рядов и папок", "Apps per row" to "Приложений в строке",
        "Free area" to "Свободная область", "Free area tile size" to "Размер плиток свободной области", "All apps in a menu" to "Все приложения в меню",
        "Menu style" to "Стиль меню", "Wallpaper shade" to "Затемнение обоев",
        "Shelf" to "Полка", "Split" to "Колонки", "Rail" to "Рейка", "Mirror" to "Зеркало", "Center" to "По центру", "Bottom" to "Внизу", "Clock size" to "Размер часов", "Free" to "Только свободная область", "Animation" to "Анимация иконок", "Animation speed" to "Скорость анимации", "Zoom" to "Увеличение", "Lift" to "Подъём", "Bounce" to "Пружина", "Move icons" to "Двигать иконки", "Add app" to "Добавить приложение", "Remove" to "Убрать", "Done" to "Готово", "Press OK to pick up an icon, arrows move it, OK drops it. Back closes." to "OK берёт иконку, стрелки двигают, OK кладёт. «Назад» — выход.", "Weather loading…" to "Загружаю погоду…", "No weather data" to "Нет данных о погоде", "Open" to "Открыть", "Weather" to "Погода", "News" to "Новости", "Glow" to "Свечение", "Outline" to "Рамка", "None" to "Нет",
        "Time date" to "Время и дата", "Time" to "Только время", "Off" to "Выкл.", "On" to "Вкл.",
        "Sheet" to "Снизу", "Side" to "Справа", "Full" to "Во весь экран",
    )

    fun ru(cfg: HomeConfig): Boolean = cfg.language == "ru" || (cfg.language == "auto" && Locale.getDefault().language == "ru")

    fun tr(cfg: HomeConfig, en: String): String = if (ru(cfg)) RU[en] ?: en else en
}
