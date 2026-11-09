package com.nagla.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Spring
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

@Composable
fun SectionCard(
    modifier: Modifier = Modifier,
    title: String? = null,
    icon: ImageVector? = null,
    action: (@Composable () -> Unit)? = null,
    highlighted: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = modifier.fillMaxWidth().animateContentSize(tween(220)),
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(if (highlighted) 2.dp else 1.dp,
            if (highlighted) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (title != null) Row(verticalAlignment = Alignment.CenterVertically) {
                if (icon != null) { Icon(icon, null, tint = MaterialTheme.colorScheme.primary); Spacer(Modifier.width(8.dp)) }
                Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                action?.invoke()
            }
            content()
        }
    }
}

@Composable
fun StatusBadge(status: String, stage: String?) {
    val (bg, fg) = when (groupOf(status, stage)) {
        Group.Pending -> Color(0xFFFFF3CD) to Color(0xFF7A5A00)
        Group.Active -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
        Group.Done -> Brand.Lime to Brand.Navy
        Group.Off -> Color(0xFFF9DEDC) to Color(0xFF8C1D18)
    }
    Row(
        Modifier.clip(CircleShape).background(bg).padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(fg))
        Spacer(Modifier.width(6.dp))
        Text(stageName(stage ?: status), color = fg, style = MaterialTheme.typography.labelMedium, maxLines = 1)
    }
}

@Composable
fun InfoRow(label: String, value: String, icon: ImageVector? = null) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.Top) {
        if (icon != null) { Icon(icon, null, Modifier.size(18.dp).padding(top = 2.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.width(8.dp)) }
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.widthIn(min = 90.dp, max = 130.dp))
        Spacer(Modifier.width(8.dp))
        Text(value, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
    }
}

@Composable
fun StatTile(title: String, value: String, modifier: Modifier = Modifier, icon: ImageVector? = null, onClick: (() -> Unit)? = null) {
    Surface(
        modifier = modifier.then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(14.dp)) {
            if (icon != null) Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
            Text(value, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
            Text(title, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
fun EmptyState(title: String, sub: String = "", icon: ImageVector = Icons.Outlined.Inventory2, action: (@Composable () -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(icon, null, Modifier.size(42.dp), tint = MaterialTheme.colorScheme.primary)
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (sub.isNotBlank()) Text(sub, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        action?.invoke()
    }
}

@Composable
fun ErrorNote(text: String?) {
    if (text == null) return
    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.small, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.ErrorOutline, null, tint = MaterialTheme.colorScheme.onErrorContainer)
            Spacer(Modifier.width(8.dp))
            Text(text, color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, busy: Boolean = false, icon: ImageVector? = null) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.96f else 1f, spring(dampingRatio = 0.55f, stiffness = Spring.StiffnessMediumLow), label = "press")
    Button(onClick = onClick, enabled = enabled && !busy, modifier = modifier.graphicsLayer { scaleX = scale; scaleY = scale }.heightIn(min = 54.dp),
        shape = MaterialTheme.shapes.medium, interactionSource = interaction,
        colors = ButtonDefaults.buttonColors(containerColor = Brand.Lime, contentColor = Brand.Navy)) {
        if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = Brand.Navy)
        else { if (icon != null) { Icon(icon, null); Spacer(Modifier.width(8.dp)) }; Text(text) }
    }
}

// ---------- the journey: a ring with the current stage, then a vertical timeline (replaces the progress line)

@Composable
fun JourneyRing(stage: String?, percent: Int, modifier: Modifier = Modifier, size: Int = 132) {
    val p by animateFloatAsState(percent / 100f, tween(900, easing = FastOutSlowInEasing), label = "ring")
    val track = MaterialTheme.colorScheme.surfaceVariant
    val fill = MaterialTheme.colorScheme.primary
    val lime = Brand.Lime
    Box(modifier.size(size.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 12.dp.toPx()
            val inset = stroke / 2
            val arcSize = Size(this.size.width - stroke, this.size.height - stroke)
            drawArc(track, -90f, 360f, false, Offset(inset, inset), arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
            drawArc(fill, -90f, 360f * p, false, Offset(inset, inset), arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
            if (p > 0.01f) {
                val a = Math.toRadians((-90 + 360 * p).toDouble())
                val r = (this.size.width - stroke) / 2
                drawCircle(lime, stroke * 0.55f, Offset(center.x + (r * kotlin.math.cos(a)).toFloat(), center.y + (r * kotlin.math.sin(a)).toFloat()))
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(stageIcon(stage), null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(30.dp))
            Text("$percent%", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
    }
}

/** vertical stage list: done (check), current (pulsing), next (hollow); `skipped` shown in small text */
@Composable
fun StageTimeline(stages: List<String>, current: String?, skipped: Set<String> = emptySet(), trailing: (@Composable (String) -> Unit)? = null) {
    val index = stages.indexOf(current)
    val pulse = rememberInfiniteTransition(label = "pulse").animateFloat(0.6f, 1f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "p")
    Column {
        stages.forEachIndexed { i, s ->
            val done = index >= 0 && i < index || (i == index && s == "completed")
            val now = i == index && s != "completed"
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Box(Modifier.width(34.dp), contentAlignment = Alignment.Center) {
                    when {
                        done -> Box(Modifier.size(26.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), Alignment.Center) {
                            Icon(Icons.Outlined.Check, null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(16.dp))
                        }
                        now -> Box(Modifier.size((26 * pulse.value).dp.coerceAtLeast(18.dp)).clip(CircleShape).background(Brand.Lime), Alignment.Center) {
                            Icon(stageIcon(s), null, tint = Brand.Navy, modifier = Modifier.size(15.dp))
                        }
                        else -> Box(Modifier.size(22.dp).clip(CircleShape).border(2.dp, MaterialTheme.colorScheme.outline, CircleShape))
                    }
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(stageName(s), style = MaterialTheme.typography.bodyLarge,
                        fontWeight = if (now) FontWeight.Bold else FontWeight.Normal,
                        color = if (done || now) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
                    if (s in skipped) Text(t("تم تخطيها", "skipped"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                trailing?.invoke(s)
            }
        }
    }
}

// ---------- the 3-way "box" slider for an item: Move | Sell | Donate, drag or tap; the navy lid lands on the choice

@Composable
fun DecisionSlider(value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    val options = listOf("keep", "sell", "donate")
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    var width by remember { mutableIntStateOf(0) }
    val segment = if (width == 0) 0f else width / 3f
    val offset = remember { Animatable(options.indexOf(value).coerceAtLeast(0).toFloat()) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(value) { offset.animateTo(options.indexOf(value).coerceAtLeast(0).toFloat(), spring(dampingRatio = 0.75f)) }
    val icons = mapOf("sell" to Icons.Outlined.Sell, "keep" to Icons.Outlined.LocalShipping, "donate" to Icons.Outlined.FavoriteBorder)

    Box(
        modifier.fillMaxWidth().height(54.dp).clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.background)
            .onSizeChanged { width = it.width }
            .pointerInput(width) {
                detectHorizontalDragGestures(
                    onDragEnd = {
                        val i = offset.value.roundToInt().coerceIn(0, 2)
                        scope.launch { offset.animateTo(i.toFloat(), spring(dampingRatio = 0.75f)) }
                        if (options[i] != value) onChange(options[i])
                    },
                ) { change, drag ->
                    change.consume()
                    if (segment > 0) scope.launch { offset.snapTo((offset.value + (if (rtl) -drag else drag) / segment).coerceIn(0f, 2f)) }
                }
            },
    ) {
        // the three compartments
        Row(Modifier.fillMaxSize().selectableGroup()) {
            options.forEach { o ->
                Row(Modifier.weight(1f).fillMaxHeight().selectable(selected = value == o, role = Role.RadioButton) { onChange(o) },
                    horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Text(dispositionName(o), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(6.dp))
                    Icon(icons[o]!!, null, Modifier.size(17.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        // the sliding lid (Modifier.offset is RTL-aware: index 0 is the start side in both directions)
        if (segment > 0) {
            val x = (offset.value * segment).roundToInt()
            val o = options[offset.value.roundToInt().coerceIn(0, 2)]
            val colors = MaterialTheme.colorScheme
            Row(
                Modifier.clearAndSetSemantics { }.offset { IntOffset(x, 0) }
                    .width(with(androidx.compose.ui.platform.LocalDensity.current) { segment.toDp() }).fillMaxHeight().padding(4.dp)
                    .clip(RoundedCornerShape(10.dp)).background(colors.surface)
                    .border(1.dp, colors.primary, RoundedCornerShape(10.dp)),
                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(dispositionName(o), style = MaterialTheme.typography.labelLarge, color = colors.primary, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(6.dp))
                Icon(Icons.Outlined.Check, null, Modifier.size(17.dp), tint = colors.primary)
            }
        }
    }
}

// ---------- scanning animation: a box opens and a spyglass checks inside

@Composable
fun ScanAnimation(modifier: Modifier = Modifier) {
    val inf = rememberInfiniteTransition(label = "scan")
    val lid by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(5180, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "lid")
    val sweep by inf.animateFloat(-1f, 1f, infiniteRepeatable(tween(1100, easing = LinearEasing), RepeatMode.Reverse), label = "sweep")
    val navy = Brand.Navy
    val teal = Brand.Teal
    val lime = Brand.Lime
    val side = lerp(Brand.Lime, Brand.Navy, 0.22f)   // the side face, a little darker
    val inside = lerp(Brand.Lime, Brand.Navy, 0.55f) // the inside of the open box
    val glass = MaterialTheme.colorScheme.surface
    // a box drawn in three dimensions: front, side and the open top
    Canvas(modifier.size(200.dp).clearAndSetSemantics { }) {
        val w = size.width
        val left = w * 0.20f; val top = w * 0.50f
        val bw = w * 0.48f; val bh = w * 0.28f   // front face
        val dx = bw * 0.34f; val dy = bw * 0.24f // depth, drawn up and to the right
        fun face(p: List<Offset>, fill: Color) {
            val path = Path().apply { moveTo(p[0].x, p[0].y); p.drop(1).forEach { lineTo(it.x, it.y) }; close() }
            drawPath(path, fill)
            drawPath(path, navy, style = Stroke(4f, join = StrokeJoin.Round))
        }
        val fl = Offset(left, top); val fr = Offset(left + bw, top)               // front top edge
        val bl = Offset(left + dx, top - dy); val br = Offset(left + bw + dx, top - dy) // back top edge
        // the opening (inside), then the side and the front
        face(listOf(fl, bl, br, fr), fill = inside)
        face(listOf(fr, br, Offset(br.x, br.y + bh), Offset(fr.x, fr.y + bh)), fill = side)
        face(listOf(fl, fr, Offset(fr.x, fr.y + bh), Offset(fl.x, fl.y + bh)), fill = lime)
        drawLine(navy, Offset(left + bw / 2, top), Offset(left + bw / 2, top + bh * 0.42f), 4f) // tape
        // two flaps on the left and right edges of the opening, swinging out
        val open = 0.25f + 0.75f * lid
        val leftTip = Offset(lerpF(bw * 0.5f, -bw * 0.32f, open), lerpF(0f, -bh * 0.5f, open))
        val rightTip = Offset(lerpF(-bw * 0.5f, bw * 0.32f, open), lerpF(0f, -bh * 0.5f, open))
        face(listOf(fl, bl, bl + leftTip, fl + leftTip), fill = teal)
        face(listOf(fr, br, br + rightTip, fr + rightTip), fill = teal)

        // the spyglass sweeping over the opening: lens centred on (gx, gy), handle attached to its rim
        val r = w * 0.10f
        val gx = left + bw / 2 + dx / 2 + sweep * bw * 0.26f - r * 0.4f
        val gy = top - dy / 2 - r * 1.1f - lid * r * 0.35f
        translate(gx, gy) {
            val c = Offset.Zero
            val rim = r * 0.71f // cos 45° × r: where the handle leaves the lens
            drawLine(navy, Offset(rim, rim), Offset(r * 1.75f, r * 1.75f), 11f, cap = StrokeCap.Round)
            drawCircle(glass, r, c)
            drawCircle(teal.copy(alpha = 0.25f), r * 0.72f, c)
            drawCircle(navy, r, c, style = Stroke(6f))
            drawArc(Color.White.copy(alpha = 0.8f), 200f, 60f, false, Offset(-r * 0.6f, -r * 0.6f), Size(r * 1.2f, r * 1.2f), style = Stroke(4f, cap = StrokeCap.Round))
        }
    }
}

private fun lerpF(a: Float, b: Float, f: Float) = a + (b - a) * f

@Composable
fun StarsInput(value: Int, onChange: (Int) -> Unit) {
    val colors = MaterialTheme.colorScheme
    Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        (1..5).forEach { n ->
            val selected = n == value
            val shape = MaterialTheme.shapes.small
            Column(
                Modifier.weight(1f).heightIn(min = 54.dp).clip(shape)
                    .background(if (selected) colors.primaryContainer else colors.surface)
                    .border(1.dp, if (selected) colors.primary else colors.outlineVariant, shape)
                    .selectable(selected, role = Role.RadioButton) { onChange(n) }
                    .padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(if (n <= value) Icons.Filled.Star else Icons.Outlined.StarOutline, t("$n من 5", "$n of 5"),
                    tint = if (n <= value) colors.primary else colors.onSurfaceVariant, modifier = Modifier.size(21.dp))
                Text("$n", Modifier.clearAndSetSemantics { }, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

fun stars(n: Int) = "★".repeat(n.coerceIn(0, 5)) + "☆".repeat(5 - n.coerceIn(0, 5))
