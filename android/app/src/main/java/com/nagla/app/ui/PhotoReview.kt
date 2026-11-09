package com.nagla.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.AbsoluteAlignment
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.nagla.app.data.AiRun
import com.nagla.app.data.Api
import com.nagla.app.data.Box
import com.nagla.app.data.Photo
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/**
 * "Check what we found": each scanned photo with a numbered pin on every detected item (no grid or boxes for the
 * customer; the 3x3 cell the AI gave stays in the data and the debug view). Tap a pin to jump to its item.
 */
@Composable
fun PhotoReviewCard(photos: List<Photo>, numbers: Map<String, Int>, selected: String?, onSelect: (String) -> Unit) {
    val pager = rememberPagerState { photos.size }
    // when an item is picked from the list, show the photo it is on
    LaunchedEffect(selected) {
        val i = photos.indexOfFirst { p -> p.detections.any { it.item_id == selected } }
        if (selected != null && i >= 0 && i != pager.currentPage) pager.animateScrollToPage(i)
    }
    SectionCard(title = t("راجع ما وجدناه", "Check what we found"), icon = Icons.Outlined.PhotoLibrary) {
        Text(t("لكل قطعة رقم على صورتها. اضغط الرقم لترى القطعة، واحذف ما ليس للنقل.",
            "Every item has a number on its photo. Tap a number to see the item, and delete anything that isn't moving."),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        HorizontalPager(pager, pageSpacing = 12.dp) { page ->
            NumberedPhoto(photos[page], numbers, selected, onSelect)
        }
        if (photos.size > 1) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Text(t("صورة ${pager.currentPage + 1} من ${photos.size}", "Photo ${pager.currentPage + 1} of ${photos.size}") + " · " + roomName(photos[pager.currentPage].room),
                style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else Text(roomName(photos.first().room), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun NumberedPhoto(photo: Photo, numbers: Map<String, Int>, selected: String?, onSelect: (String) -> Unit) {
    val w = (photo.width ?: 1200).toFloat()
    val h = (photo.height ?: 1600).toFloat()
    val measurer = rememberTextMeasurer()
    val teal = Brand.TealDark
    val lime = Brand.Lime
    val navy = Brand.Navy
    // one pin per item, at the centre of the object
    val pins = photo.detections.mapNotNull { d ->
        val n = numbers[d.item_id]; val b = d.box
        if (b != null && n != null) Triple(d.item_id!!, n, Offset((b.x + b.w / 2).toFloat(), (b.y + b.h / 2).toFloat())) else null
    }
    // the photo is never taller than ~60% of a phone screen
    val aspect = (w / h).coerceIn(0.5f, 2f)
    Box(Modifier.fillMaxWidth().heightIn(max = 460.dp).aspectRatio(aspect, matchHeightConstraintsFirst = true).clip(RoundedCornerShape(12.dp))) {
        AsyncImage(Api.url(photo.url), null, Modifier.fillMaxSize(), contentScale = ContentScale.FillBounds)
        Canvas(Modifier.fillMaxSize().pointerInput(pins) {
            detectTapGestures { pos ->
                // the nearest pin within a finger's reach (48dp touch target)
                val reach = 24.dp.toPx()
                pins.map { (id, _, c) -> id to (Offset(c.x * size.width, c.y * size.height) - pos).getDistance() }
                    .filter { it.second <= reach }.minByOrNull { it.second }?.let { onSelect(it.first) }
            }
        }) {
            // drawing is in the photo's own coordinates (not mirrored in Arabic); the selected pin is drawn last, on top
            pins.sortedBy { it.first == selected }.forEach { (id, n, c) ->
                val sel = id == selected
                val center = Offset(c.x * size.width, c.y * size.height)
                val r = (if (sel) 16 else 13).dp.toPx()
                drawCircle(Color.Black.copy(alpha = 0.25f), r + 2.dp.toPx(), center + Offset(0f, 1.5f.dp.toPx()))
                drawCircle(Color.White, r + 2.dp.toPx(), center)
                drawCircle(if (sel) lime else teal, r, center)
                val tag = measurer.measure("$n", TextStyle(color = if (sel) navy else Color.White, fontSize = (if (sel) 14 else 12).sp, fontWeight = FontWeight.Bold))
                drawText(tag, topLeft = center - Offset(tag.size.width / 2f, tag.size.height / 2f))
            }
        }
    }
}

/** the part of a photo inside `box` (normalised 0–1), as a square thumbnail */
@Composable
fun PhotoCrop(url: String, imgW: Int, imgH: Int, box: Box, sizeDp: Int) {
    // a little margin around the box so the object is not cut tight
    val bx = (box.x - box.w * 0.08).coerceAtLeast(0.0); val by = (box.y - box.h * 0.08).coerceAtLeast(0.0)
    val bw = (box.w * 1.16).coerceAtMost(1 - bx).coerceAtLeast(0.01); val bh = (box.h * 1.16).coerceAtMost(1 - by).coerceAtLeast(0.01)
    val rw = bw * imgW; val rh = bh * imgH
    val scale = sizeDp / maxOf(rw, rh) // dp per image pixel
    val dx = (-(bx * imgW * scale) + (sizeDp - rw * scale) / 2).toFloat()
    val dy = (-(by * imgH * scale) + (sizeDp - rh * scale) / 2).toFloat()
    Box(Modifier.size(sizeDp.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
        AsyncImage(url, null,
            Modifier.wrapContentSize(AbsoluteAlignment.TopLeft, unbounded = true)
                .requiredSize((imgW * scale).toFloat().dp, (imgH * scale).toFloat().dp)
                .absoluteOffset(dx.dp, dy.dp),
            contentScale = ContentScale.FillBounds)
    }
}

private val pretty = Json { prettyPrint = true }
private fun prettyJson(raw: String?): String = raw?.let { runCatching { pretty.encodeToString(JsonElement.serializer(), Json.parseToJsonElement(it)) }.getOrDefault(it) } ?: "—"

/** debug builds only: what Gemini answered and what the Claude filter changed, per room and scan */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiDebugSheet(moveId: String, onDismiss: () -> Unit) {
    val loader = rememberLoader(moveId) { Api.aiRuns(moveId) }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        LazyColumn(Modifier.fillMaxHeight(0.9f), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { Text(t("مخرجات الذكاء الاصطناعي", "AI output"), style = MaterialTheme.typography.titleLarge) }
            loader.error?.let { item { ErrorNote(it) } }
            if (loader.data?.isEmpty() == true) item { Text(t("لا توجد عمليات مسح محفوظة لهذا الطلب.", "No saved scans for this move.")) }
            items(loader.data.orEmpty(), key = { it.id }) { r: AiRun -> AiRunCard(r) }
        }
    }
}

@Composable
private fun AiRunCard(r: AiRun) {
    var open by remember { mutableStateOf(false) }
    SectionCard(title = roomName(r.room)) {
        Text(r.created_at.take(19).replace('T', ' ') + " UTC", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AssistChip({}, { Text("Gemini: ${r.vision_items}") })
            AssistChip({}, { Text(t("بعد الفلترة: ${r.kept_items}", "after filter: ${r.kept_items}")) })
        }
        r.filter_error?.let { ErrorNote("filter: $it") }
        TextButton({ open = !open }) { Text(if (open) t("إخفاء الرد الخام", "Hide raw output") else t("عرض الرد الخام", "Show raw output")) }
        if (open) SelectionContainer {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Gemini (vision)", fontWeight = FontWeight.Bold)
                Text(prettyJson(r.vision_raw), fontFamily = FontFamily.Monospace, fontSize = 11.sp, lineHeight = 14.sp)
                Text("Claude (filter)", fontWeight = FontWeight.Bold)
                Text(prettyJson(r.filter_raw), fontFamily = FontFamily.Monospace, fontSize = 11.sp, lineHeight = 14.sp)
            }
        }
    }
}
