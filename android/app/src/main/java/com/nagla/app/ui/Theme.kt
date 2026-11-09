package com.nagla.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nagla.app.data.Prefs

// Brand palette (approved sheet)
object Brand {
    val Navy = Color(0xFF102B36)
    val Teal = Color(0xFF19A69C)
    val TealDark = Color(0xFF096860)
    val Lime = Color(0xFFCFF26B)
    val Mint = Color(0xFFEEF4F0)
    val Splash = Color(0xFFF2F7F6)
    val Danger = Color(0xFFB3261E)
}

private val Light = lightColorScheme(
    primary = Brand.TealDark, onPrimary = Color.White,
    primaryContainer = Color(0xFFD7EEE8), onPrimaryContainer = Brand.Navy,
    secondary = Brand.Navy, onSecondary = Color.White,
    secondaryContainer = Brand.Lime, onSecondaryContainer = Brand.Navy,
    tertiary = Brand.Teal,
    background = Brand.Mint, onBackground = Brand.Navy,
    surface = Color.White, onSurface = Brand.Navy,
    surfaceVariant = Color(0xFFE3EEE8), onSurfaceVariant = Color(0xFF49616A),
    surfaceContainer = Color.White, surfaceContainerHigh = Color(0xFFF6FAF8), surfaceContainerLow = Color(0xFFF8FBF9),
    outline = Color(0xFFB9CCC4), outlineVariant = Color(0xFFD5E1DA),
    error = Brand.Danger,
)
private val Dark = darkColorScheme(
    primary = Brand.Teal, onPrimary = Color(0xFF08242C),
    primaryContainer = Color(0xFF214C4D), onPrimaryContainer = Color(0xFFF2F7F3),
    secondary = Brand.Lime, onSecondary = Brand.Navy,
    secondaryContainer = Color(0xFF3A4A1C), onSecondaryContainer = Brand.Lime,
    tertiary = Brand.Lime,
    background = Brand.Navy, onBackground = Color(0xFFF2F7F3),
    surface = Color(0xFF183844), onSurface = Color(0xFFF2F7F3),
    surfaceVariant = Color(0xFF20444D), onSurfaceVariant = Color(0xFFB8CCC8),
    surfaceContainer = Color(0xFF183844), surfaceContainerHigh = Color(0xFF1E414D), surfaceContainerLow = Color(0xFF15323D),
    outline = Color(0xFF36535A), outlineVariant = Color(0xFF2B474F),
    error = Color(0xFFFFB2A5),
)

private val Type = Typography(
    headlineMedium = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold, lineHeight = 34.sp),
    headlineSmall = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold, lineHeight = 30.sp),
    titleLarge = TextStyle(fontSize = 19.sp, fontWeight = FontWeight.Bold, lineHeight = 26.sp),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold, lineHeight = 22.sp),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 21.sp),
    labelLarge = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
)

private val AppShapes = Shapes(
    small = RoundedCornerShape(10.dp), medium = RoundedCornerShape(16.dp), large = RoundedCornerShape(22.dp),
)

@Composable
fun NaqlaTheme(content: @Composable () -> Unit) {
    val dark = when (Prefs.theme) {
        "dark" -> true
        "light" -> false
        else -> isSystemInDarkTheme()
    }
    CompositionLocalProvider(LocalLayoutDirection provides if (Prefs.lang == "ar") LayoutDirection.Rtl else LayoutDirection.Ltr) {
        MaterialTheme(colorScheme = if (dark) Dark else Light, typography = Type, shapes = AppShapes, content = content)
    }
}

/** Arabic / English text, following the app language setting (recomposes on change). */
fun t(ar: String, en: String) = if (Prefs.lang == "ar") ar else en
