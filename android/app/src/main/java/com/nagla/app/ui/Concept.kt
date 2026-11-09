package com.nagla.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Building blocks of the "Naqla native Android concept 01" sheet: a dark navy hero card with lime accents,
// route markers (circle = pickup, square = delivery), a big date badge, a boxed quantity stepper, step headers.

private val OnNavyMuted = Color(0xFFB8CCC8)

/** dark navy card (the home hero and the tracking "current stage" card) */
@Composable
fun HeroCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier.fillMaxWidth(), shape = RoundedCornerShape(26.dp), color = Brand.Navy, contentColor = Color.White) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

/** the current stage, big, with a lime progress bar */
@Composable
fun StageHeroCard(stage: String?, percent: Int, updated: String?, company: String? = null) {
    HeroCard {
        if (company != null) Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.LocalShipping, null, Modifier.size(16.dp), tint = Brand.Lime)
            Spacer(Modifier.width(6.dp))
            Text(t("شركة النقل: ", "Moving company: ") + company, style = MaterialTheme.typography.labelLarge, color = Brand.Lime)
        }
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(t("المرحلة الحالية", "Current stage"), style = MaterialTheme.typography.bodySmall, color = OnNavyMuted)
                Text(stageName(stage), style = MaterialTheme.typography.headlineSmall, color = Color.White)
            }
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).border(1.dp, Color.White.copy(alpha = 0.3f), RoundedCornerShape(12.dp)), Alignment.Center) {
                Icon(stageIcon(stage), null, tint = Brand.Lime)
            }
        }
        LinearProgressIndicator(
            progress = { (percent / 100f).coerceIn(0f, 1f) }, Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
            color = Brand.Lime, trackColor = Color.White.copy(alpha = 0.18f), strokeCap = androidx.compose.ui.graphics.StrokeCap.Round, gapSize = 0.dp, drawStopIndicator = {},
        )
        Row {
            Text(t("تقدّم المراحل ", "Progress ") + "$percent%", style = MaterialTheme.typography.bodySmall, color = OnNavyMuted, modifier = Modifier.weight(1f))
            if (updated != null) Text(t("آخر تحديث ", "Updated ") + updated, style = MaterialTheme.typography.bodySmall, color = OnNavyMuted)
        }
    }
}

/** pickup (circle) → delivery (square) with a line between them */
@Composable
fun RouteLines(from: String?, to: String?, fromLabel: String? = null, toLabel: String? = null, fromSub: String? = null, toSub: String? = null) {
    val line = MaterialTheme.colorScheme.outlineVariant
    Row(Modifier.height(IntrinsicSize.Min)) {
        Column(Modifier.width(20.dp).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
            Spacer(Modifier.height(if (fromLabel != null) 20.dp else 6.dp))
            Box(Modifier.size(11.dp).border(2.dp, Brand.TealDark, CircleShape))
            Box(Modifier.width(2.dp).weight(1f).background(line))
            Box(Modifier.size(10.dp).background(Brand.Navy))
            Spacer(Modifier.height(if (toSub != null) 22.dp else 6.dp))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            RouteStop(fromLabel, from, fromSub)
            RouteStop(toLabel, to, toSub)
        }
    }
}

@Composable
private fun RouteStop(label: String?, text: String?, sub: String?) {
    Column {
        if (label != null) Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text ?: "—", style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (sub != null) Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

/** the day number, big, over the month (the home "next move" card) */
@Composable
fun DateBadge(iso: String?) {
    val d = runCatching { java.time.LocalDate.parse(iso!!.take(10)) }.getOrNull()
    val loc = if (com.nagla.app.data.Prefs.lang == "ar") java.util.Locale("ar") else java.util.Locale.ENGLISH
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 8.dp).widthIn(min = 44.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(d?.dayOfMonth?.toString() ?: "—", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
            Text(d?.format(java.time.format.DateTimeFormatter.ofPattern("MMMM", loc)) ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** "Thursday, 12 November" */
fun dayMonthText(iso: String?): String {
    val d = runCatching { java.time.LocalDate.parse(iso!!.take(10)) }.getOrNull() ?: return "—"
    val loc = if (com.nagla.app.data.Prefs.lang == "ar") java.util.Locale("ar") else java.util.Locale.ENGLISH
    return d.format(java.time.format.DateTimeFormatter.ofPattern("EEEE، d MMMM".let { if (com.nagla.app.data.Prefs.lang == "ar") it else "EEEE, d MMMM" }, loc))
}

/** an ISO timestamp as the local 12-hour time ("9:35 ص") */
fun clockText(iso: String?): String? = runCatching {
    val z = java.time.OffsetDateTime.parse(iso!!).atZoneSameInstant(java.time.ZoneId.systemDefault())
    time12("%02d:%02d".format(java.util.Locale.US, z.hour, z.minute))
}.getOrNull()

/** [ − n + ] in one outlined box */
@Composable
fun QuantityStepper(value: Int, onMinus: () -> Unit, onPlus: () -> Unit, canMinus: Boolean = value > 1) {
    Surface(shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), color = MaterialTheme.colorScheme.surface) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onMinus, enabled = canMinus) { Icon(Icons.Outlined.Remove, t("أقل", "Less")) }
            Box(Modifier.width(1.dp).height(28.dp).background(MaterialTheme.colorScheme.outlineVariant))
            Text("$value", Modifier.widthIn(min = 40.dp).padding(horizontal = 6.dp), style = MaterialTheme.typography.titleMedium, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            Box(Modifier.width(1.dp).height(28.dp).background(MaterialTheme.colorScheme.outlineVariant))
            IconButton(onPlus) { Icon(Icons.Outlined.Add, t("أكثر", "More")) }
        }
    }
}

/** a step's big title and one line under it */
@Composable
fun StepHeader(title: String, sub: String) {
    Column(Modifier.padding(bottom = 2.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Text(sub, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** a soft mint note with an icon (scan tips, the move summary on the offers step) */
@Composable
fun InfoBanner(icon: ImageVector, content: @Composable ColumnScope.() -> Unit) {
    Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp), content = content)
            Spacer(Modifier.width(10.dp))
            Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** one fact in an offer's 2x2 grid: icon, small label, bold value */
@Composable
fun FactCell(icon: ImageVector, label: String, value: String, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(8.dp))
        Column {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        }
    }
}

/** a person's first letter in a soft circle */
@Composable
fun Initial(name: String?, size: Int = 44) {
    Box(Modifier.size(size.dp).clip(CircleShape).background(MaterialTheme.colorScheme.background).border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape), Alignment.Center) {
        Text(name?.trim()?.take(1)?.uppercase() ?: "?", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
    }
}

/** small chip with a check ("✓ تم تعيين الفني") */
@Composable
fun CheckChip(text: String) {
    Surface(shape = RoundedCornerShape(50), color = Brand.Lime.copy(alpha = 0.45f)) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Check, null, Modifier.size(14.dp), tint = Brand.Navy)
            Spacer(Modifier.width(4.dp))
            Text(text, style = MaterialTheme.typography.labelMedium, color = Brand.Navy)
        }
    }
}
