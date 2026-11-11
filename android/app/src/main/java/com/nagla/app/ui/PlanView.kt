package com.nagla.app.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.nagla.app.data.MovePlan
import com.nagla.app.data.Text2

/** a bilingual text from the plan, in the app's language */
fun tx(v: Text2): String = t(v.ar, v.en)

private fun whenTitle(w: String) = when (w) {
    "week" -> t("قبل أسبوع", "A week before")
    "two_days" -> t("قبل يومين", "Two days before")
    "night" -> t("الليلة السابقة", "The night before")
    else -> t("صباح يوم النقل", "The morning of the move")
}

private fun minutesText(m: Int): String {
    val h = m / 60; val r = m % 60
    return when {
        h == 0 -> t("$r دقيقة", "$r min")
        r == 0 -> t(if (h == 1) "ساعة" else "$h ساعات", if (h == 1) "1 h" else "$h h")
        else -> t("$h س $r د", "$h h $r min")
    }
}

/** the whole plan as list items (booking step 5 adds its own header and buttons around it) */
fun LazyListScope.planItems(plan: MovePlan) {
    val f = plan.facts
    item(key = "plan-head") {
        HeroCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(if (plan.source == "ai") Icons.Outlined.AutoAwesome else Icons.Outlined.Checklist, null, Modifier.size(16.dp), tint = Brand.Lime)
                Spacer(Modifier.width(6.dp))
                Text(if (plan.source == "ai") t("خطة من نقلة الذكية", "Planned by Naqla AI") else t("خطة نقلة", "Naqla plan"),
                    style = MaterialTheme.typography.labelLarge, color = Brand.Lime)
            }
            Text(tx(plan.headline), Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineSmall, color = androidx.compose.ui.graphics.Color.White)
            Text(tx(plan.summary), style = MaterialTheme.typography.bodyMedium, color = androidx.compose.ui.graphics.Color(0xFFCBDFD9))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PlanPill(Icons.Outlined.Event, dayMonthText(f.date))
                PlanPill(Icons.Outlined.Schedule, time12(f.start_time) + " – " + time12(f.end_time))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PlanPill(Icons.Outlined.LocalShipping, truckName(f.truck_name) + " · " + tripsText(f.trips))
                PlanPill(Icons.Outlined.Groups, t("${f.crew_size} عمال", "Crew of ${f.crew_size}"))
            }
        }
    }
    if (plan.before.isNotEmpty()) item(key = "plan-before") {
        SectionCard(title = t("قبل يوم النقل", "Before the day"), icon = Icons.Outlined.EventNote) {
            plan.before.forEach { g ->
                Text(whenTitle(g.`when`), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                g.tasks.forEach { task -> Tick(tx(task)) }
            }
        }
    }
    if (plan.day.isNotEmpty()) item(key = "plan-day") {
        SectionCard(title = t("يوم النقل", "Moving day"), icon = Icons.Outlined.Schedule) {
            Text(t("الأوقات تقريبية، وتمشي حسب سرعة العمل.", "Times are approximate and follow the pace of the work."),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            plan.day.forEachIndexed { i, s ->
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).semantics(mergeDescendants = true) { }) {
                    Text(time12(s.start), Modifier.width(76.dp).padding(top = 1.dp), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                    Column(Modifier.width(18.dp).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(Modifier.padding(top = 5.dp).size(10.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
                        if (i < plan.day.lastIndex) Box(Modifier.width(2.dp).weight(1f).background(MaterialTheme.colorScheme.outlineVariant))
                    }
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f).padding(bottom = 12.dp)) {
                        Text(tx(s.title), style = MaterialTheme.typography.titleSmall)
                        s.note?.let { Text(tx(it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        Text(minutesText(s.minutes), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
    if (plan.load_order.isNotEmpty()) item(key = "plan-load") {
        SectionCard(title = t("ترتيب التحميل", "Loading order"), icon = Icons.Outlined.Inventory2) {
            plan.load_order.forEachIndexed { i, g ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(26.dp).clip(CircleShape).background(Brand.Lime), Alignment.Center) {
                        Text("${i + 1}", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = Brand.Navy)
                    }
                    Spacer(Modifier.width(10.dp))
                    Text(tx(g.title), style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                }
                g.note?.let { Text(tx(it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                // the same item several times reads as one name with its count ("كرسي × 6")
                Text(g.items.groupBy { t(it.name_ar, it.name_en) }.entries.joinToString(t("، ", ", ")) { (name, same) ->
                    val n = same.sumOf { it.quantity }
                    name + if (n > 1) " × $n" else ""
                }, style = MaterialTheme.typography.bodyMedium)
                if (i < plan.load_order.lastIndex) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
    }
    if (plan.tips.isNotEmpty()) item(key = "plan-tips") {
        InfoBanner(Icons.Outlined.Lightbulb) {
            Text(t("نصائح لنقلتك", "Tips for your move"), style = MaterialTheme.typography.titleSmall)
            plan.tips.forEach { Text("• " + tx(it), style = MaterialTheme.typography.bodyMedium) }
        }
    }
}

@Composable
private fun PlanPill(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Surface(shape = RoundedCornerShape(50), color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.12f)) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, Modifier.size(15.dp), tint = Brand.Lime)
            Spacer(Modifier.width(6.dp))
            Text(text, style = MaterialTheme.typography.labelMedium, color = androidx.compose.ui.graphics.Color.White, maxLines = 1)
        }
    }
}

@Composable
private fun Tick(text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Icon(Icons.Outlined.CheckCircleOutline, null, Modifier.padding(top = 2.dp).size(18.dp), tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(8.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium)
    }
}

/** while the AI writes the plan: a soft pulsing clipboard and a line that changes */
@Composable
fun PlanLoading() {
    val inf = rememberInfiniteTransition(label = "plan")
    val pulse by inf.animateFloat(0.55f, 1f, infiniteRepeatable(tween(1300, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "pulse")
    val lines = listOf(
        t("نرتّب أغراضك غرفة غرفة…", "Sorting your things room by room…"),
        t("نحسب وقت التحميل والطريق…", "Working out loading and drive time…"),
        t("نجهّز قائمة ما قبل يوم النقل…", "Writing your before-the-day checklist…"),
    )
    var i by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) { while (true) { kotlinx.coroutines.delay(2200); i = (i + 1) % lines.size } }
    Column(Modifier.fillMaxWidth().padding(vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(Modifier.size(96.dp).alpha(pulse).clip(RoundedCornerShape(28.dp)).background(Brand.Lime).clearAndSetSemantics { }, Alignment.Center) {
            Icon(Icons.Outlined.AutoAwesome, null, Modifier.size(44.dp), tint = Brand.Navy)
        }
        Text(t("نجهّز خطة نقلتك", "Making your moving plan"), style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        Text(lines[i], style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        LinearProgressIndicator(Modifier.width(160.dp))
    }
}

/** the locked plan on a move's page (customer, company, technician): opens into the full plan */
@Composable
fun MovePlanCard(plan: MovePlan, onOpen: () -> Unit) {
    SectionCard(title = t("خطة النقلة", "Moving plan"), icon = Icons.Outlined.AutoAwesome) {
        Text(tx(plan.headline), style = MaterialTheme.typography.titleMedium)
        Text(time12(plan.facts.start_time) + " – " + time12(plan.facts.end_time) + " · " + t("${plan.load_order.size} مجموعات تحميل", "${plan.load_order.size} loading groups"),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(onOpen, Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = MaterialTheme.shapes.medium) {
            Text(t("عرض الخطة كاملة", "See the full plan"))
        }
    }
}

/** the full plan as a page */
@Composable
fun MovePlanScreen(plan: MovePlan, onBack: () -> Unit) {
    androidx.activity.compose.BackHandler(onBack = onBack)
    AppScreen(t("خطة النقلة", "Moving plan"), onBack = onBack) { pad ->
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = pad.calculateTopPadding() + 8.dp, bottom = pad.calculateBottomPadding() + 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) { planItems(plan) }
    }
}
