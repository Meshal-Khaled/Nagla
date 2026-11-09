package com.nagla.app.ui

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import com.nagla.app.R
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
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
    outline = Color(0xFFB9CCC4), outlineVariant = Color(0xFFD8E3DD),
    error = Brand.Danger,
)
private val Dark = darkColorScheme(
    primary = Color(0xFF6CD9C9), onPrimary = Color(0xFF08242C),
    primaryContainer = Color(0xFF214C4D), onPrimaryContainer = Color(0xFFF2F7F3),
    secondary = Brand.Lime, onSecondary = Brand.Navy,
    secondaryContainer = Color(0xFF3A4A1C), onSecondaryContainer = Brand.Lime,
    tertiary = Brand.Lime,
    background = Brand.Navy, onBackground = Color(0xFFF2F7F3),
    surface = Color(0xFF183844), onSurface = Color(0xFFF2F7F3),
    surfaceVariant = Color(0xFF20444D), onSurfaceVariant = Color(0xFFB8CCC8),
    surfaceContainer = Color(0xFF183844), surfaceContainerHigh = Color(0xFF1E414D), surfaceContainerLow = Color(0xFF15323D),
    outline = Color(0xFF809A99), outlineVariant = Color(0xFF36535A),
    error = Color(0xFFFFB2A5),
)

private val Type = Typography(
    displaySmall = TextStyle(fontSize = 29.sp, fontWeight = FontWeight.Bold, lineHeight = 37.sp),
    headlineMedium = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold, lineHeight = 34.sp),
    headlineSmall = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold, lineHeight = 30.sp),
    titleLarge = TextStyle(fontSize = 19.sp, fontWeight = FontWeight.Bold, lineHeight = 26.sp),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold, lineHeight = 22.sp),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 21.sp),
    labelLarge = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
)

private val ArabicDisplay = FontFamily(Font(R.font.naqla_heading, FontWeight.Bold))
private val ArabicBody = FontFamily(Font(R.font.naqla_body))

private val ArabicType = Type.copy(
    displaySmall = Type.displaySmall.copy(fontFamily = ArabicDisplay, lineHeight = 42.sp),
    headlineMedium = Type.headlineMedium.copy(fontFamily = ArabicDisplay, lineHeight = 40.sp),
    headlineSmall = Type.headlineSmall.copy(fontFamily = ArabicDisplay, lineHeight = 34.sp),
    titleLarge = Type.titleLarge.copy(fontFamily = ArabicDisplay, lineHeight = 29.sp),
    titleMedium = Type.titleMedium.copy(fontFamily = ArabicBody, lineHeight = 25.sp),
    titleSmall = Type.titleSmall.copy(fontFamily = ArabicBody),
    bodyLarge = Type.bodyLarge.copy(fontFamily = ArabicBody, lineHeight = 27.sp),
    bodyMedium = Type.bodyMedium.copy(fontFamily = ArabicBody, lineHeight = 24.sp),
    bodySmall = Type.bodySmall.copy(fontFamily = ArabicBody, lineHeight = 20.sp),
    labelLarge = Type.labelLarge.copy(fontFamily = ArabicBody, lineHeight = 24.sp),
    labelMedium = Type.labelMedium.copy(fontFamily = ArabicBody, lineHeight = 20.sp),
    labelSmall = Type.labelSmall.copy(fontFamily = ArabicBody, lineHeight = 17.sp),
)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp), small = RoundedCornerShape(11.dp),
    medium = RoundedCornerShape(14.dp), large = RoundedCornerShape(18.dp),
    extraLarge = RoundedCornerShape(22.dp),
)

@Composable
fun NaqlaTheme(content: @Composable () -> Unit) {
    val dark = when (Prefs.theme) {
        "dark" -> true
        "light" -> false
        else -> isSystemInDarkTheme()
    }
    val view = LocalView.current
    SideEffect {
        (view.context as? Activity)?.window?.let { window ->
            val bars = WindowCompat.getInsetsController(window, view)
            bars.isAppearanceLightStatusBars = !dark
            bars.isAppearanceLightNavigationBars = !dark
        }
    }
    val arabic = Prefs.lang == "ar"
    CompositionLocalProvider(LocalLayoutDirection provides if (arabic) LayoutDirection.Rtl else LayoutDirection.Ltr) {
        MaterialTheme(
            colorScheme = if (dark) Dark else Light,
            typography = if (arabic) ArabicType else Type,
            shapes = AppShapes,
            content = content,
        )
    }
}

/** Arabic / English text, following the app language setting (recomposes on change). */
fun t(ar: String, en: String) = if (Prefs.lang == "ar") ar else en
