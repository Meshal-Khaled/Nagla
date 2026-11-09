package com.nagla.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** App settings + session tokens. Observable (Compose state) so language/theme switch instantly. */
object Prefs {
    private lateinit var sp: SharedPreferences

    var lang by mutableStateOf("ar")
        private set
    var theme by mutableStateOf("light") // light (default) | dark | system
        private set

    fun init(context: Context) {
        sp = context.getSharedPreferences("naqla", Context.MODE_PRIVATE)
        lang = sp.getString("lang", "ar") ?: "ar"
        theme = sp.getString("theme", "light") ?: "light"
    }

    fun setLanguage(value: String) { lang = value; sp.edit().putString("lang", value).apply() }
    fun setThemeMode(value: String) { theme = value; sp.edit().putString("theme", value).apply() }

    var access: String?
        get() = sp.getString("access", null)
        set(v) = sp.edit().putString("access", v).apply()
    var refresh: String?
        get() = sp.getString("refresh", null)
        set(v) = sp.edit().putString("refresh", v).apply()

    fun clearSession() = sp.edit().remove("access").remove("refresh").apply()
}
