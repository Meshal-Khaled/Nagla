package com.nagla.app.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.navigation.NavHostController
import com.nagla.app.data.Api
import com.nagla.app.data.TaskRow
import kotlinx.coroutines.launch
import java.io.File

@Composable
fun TaskCard(x: TaskRow, onClick: () -> Unit) {
    MoveCard(com.nagla.app.data.MoveRow(
        id = x.id, move_no = x.move_no, status = x.status, current_stage = x.current_stage, date_from = x.date_from, date_to = x.date_to,
        preferred_time = x.preferred_time, pickup_address = x.pickup_address, dropoff_address = x.dropoff_address, customer_name = x.customer_name,
    ), onClick)
}

@Composable
fun TechHome(nav: NavHostController, bottom: @Composable () -> Unit) {
    val loader = rememberLoader(pollMs = 15_000) { Api.techSummary() }
    AppScreen(t("أهلاً، ", "Hello, ") + (loader.data?.name ?: Session.me!!.name).substringBefore(' '), bottomBar = bottom) { pad ->
        RefreshList(loader, pad) { s ->
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile(t("مسندة", "Assigned"), s.counts.assigned.toString(), Modifier.weight(1f), Icons.Outlined.Assignment) { nav.navigate("tasks") }
                    StatTile(t("قيد التنفيذ", "In progress"), s.counts.in_progress.toString(), Modifier.weight(1f), Icons.Outlined.LocalShipping) { nav.navigate("tasks") }
                    StatTile(t("مكتملة", "Completed"), s.counts.completed.toString(), Modifier.weight(1f), Icons.Outlined.TaskAlt) { nav.navigate("tasks") }
                }
            }
            item { Text(t("المهمة التالية", "Next task"), style = MaterialTheme.typography.titleLarge) }
            item {
                val n = s.next_task
                if (n == null) SectionCard { EmptyState(t("لا توجد مهام مفتوحة", "No open tasks"), t("ستظهر مهامك عندما تسندها إليك الشركة.", "Tasks appear when your company assigns them."), Icons.Outlined.WorkOutline) }
                else TaskCard(n) { nav.navigate("task/${n.id}") }
            }
        }
    }
}

@Composable
fun TechTasks(nav: NavHostController, bottom: @Composable () -> Unit) {
    var scope by remember { mutableStateOf("all") }
    val loader = rememberLoader(scope, pollMs = 15_000) { Api.techTasks(scope) }
    AppScreen(t("مهامي", "My tasks"), bottomBar = bottom) { pad ->
        RefreshList(loader, pad) { tasks ->
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("all" to t("الكل", "All"), "assigned" to t("مسندة", "Assigned"), "in_progress" to t("جارية", "Active"), "completed" to t("مكتملة", "Done"))
                        .forEach { (k, label) -> FilterChip(scope == k, { scope = k }, { Text(label) }) }
                }
            }
            if (tasks.isEmpty()) item { EmptyState(t("لا توجد مهام هنا", "No tasks here"), icon = Icons.Outlined.WorkOutline) }
            items(tasks, key = { it.id }) { x -> TaskCard(x) { nav.navigate("task/${x.id}") } }
        }
    }
}

/** the technician's task: status steps with buttons, navigation, client chat, load order, rating */
@Composable
fun TaskScreen(nav: NavHostController, id: String) {
    val context = LocalContext.current
    val loader = rememberLoader(id, pollMs = 10_000) { Api.task(id) }
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var pendingStage by remember { mutableStateOf<String?>(null) }
    var photoUri by remember { mutableStateOf<Uri?>(null) }

    fun setStage(stage: String, photo: Uri?) {
        busy = stage; error = null
        scope.launch {
            try {
                Api.techStatus(id, stage, photo?.let { compressPhoto(context, it, 1280) })
                loader.reload(true)
            } catch (e: Exception) { error = errorText(e) } finally { busy = null }
        }
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val s = pendingStage; pendingStage = null
        if (s != null) setStage(s, if (ok) photoUri else null)
    }
    fun withPhoto(stage: String) {
        val dir = File(context.cacheDir, "camera").apply { mkdirs() }
        photoUri = FileProvider.getUriForFile(context, context.packageName + ".files", File(dir, "status-${System.currentTimeMillis()}.jpg"))
        pendingStage = stage
        camera.launch(photoUri!!)
    }

    AppScreen(loader.data?.let { "#${it.move_no}" } ?: t("المهمة", "Task"), onBack = { nav.popBackStack() }) { pad ->
        RefreshList(loader, pad) { x ->
            val done = x.current_stage == "completed"
            item {
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        JourneyRing(x.current_stage, x.progress?.percent ?: 0, size = 104)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            StatusBadge(x.status, x.current_stage)
                            Text(x.customer.name, style = MaterialTheme.typography.titleLarge)
                            Text(dateLine(x.schedule.date_from, x.schedule.date_to, x.schedule.preferred_time), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    ErrorNote(error)
                    x.recommended_next?.let { next ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            PrimaryButton(techAction(next), { setStage(next, null) }, Modifier.weight(1f), busy = busy == next, icon = stageIcon(next))
                            FilledTonalIconButton({ withPhoto(next) }, Modifier.size(52.dp), enabled = busy == null) { Icon(Icons.Outlined.PhotoCamera, t("مع صورة", "With a photo")) }
                        }
                    }
                }
            }
            if (done) item {
                SectionCard {
                    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Outlined.TaskAlt, null, Modifier.size(56.dp), tint = MaterialTheme.colorScheme.primary)
                        Text(t("تم إكمال النقل بنجاح!", "The move has been completed successfully!"), style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
                        x.duration_minutes?.let { Text("$it " + t("دقيقة في المهمة", "min on the job"), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
            }
            if (done) item {
                val r = x.client_rating
                if (r != null) SectionCard(title = t("تقييمك للعميل", "Your rating of the client"), icon = Icons.Outlined.StarOutline) { Text(stars(r.stars) + (r.comment?.let { " · $it" } ?: "")) }
                else RateCard(t("قيّم العميل وأغلق المهمة", "Rate the client and close the task")) { s, c ->
                    scope.launch { runCatching { Api.rateClient(id, s, c); loader.reload(true) }.onFailure { error = errorText(it) } }
                }
            }
            if (!done) item {
                SectionCard(title = t("تحديث الحالة", "Update status"), icon = Icons.Outlined.Checklist) {
                    StageTimeline(TECH_STAGES, x.statuses.lastOrNull { it.done }?.stage ?: x.current_stage,
                        x.events.filter { it.skipped }.map { it.stage }.toSet()) { s ->
                        if (s in x.next_stages && s != x.recommended_next) TextButton({ setStage(s, null) }, enabled = busy == null) { Text(t("تخطي إلى هنا", "Skip to")) }
                    }
                }
            }
            item {
                SectionCard(title = t("المحادثة مع العميل", "Chat with the client"), icon = Icons.AutoMirrored.Outlined.Chat) {
                    PrimaryButton(t("فتح المحادثة", "Open chat"), { nav.navigate("chat/$id") }, Modifier.fillMaxWidth(), icon = Icons.AutoMirrored.Outlined.Chat)
                }
            }
            item {
                SectionCard(title = t("معلومات النقل", "Move information"), icon = Icons.Outlined.Info) {
                    PlaceRow(t("الاستلام", "Pickup"), x.pickup)
                    HorizontalDivider()
                    PlaceRow(t("التسليم", "Delivery"), x.dropoff)
                    HorizontalDivider()
                    InfoRow(t("الخدمات", "Services"), x.services.joinToString("، ") { serviceName(it) }, Icons.Outlined.Handyman)
                    x.quote?.let { InfoRow(t("الشاحنة", "Truck"), "${it.truck_name} × ${it.trips} · " + t("عمال ", "crew ") + it.crew_size, Icons.Outlined.LocalShipping) }
                    if (!x.notes.isNullOrBlank()) InfoRow(t("ملاحظات", "Notes"), x.notes, Icons.Outlined.StickyNote2)
                }
            }
            item {
                SectionCard(title = t("ترتيب التحميل", "Load order") + " · ${x.job_sheet.totals.items}", icon = Icons.Outlined.Inventory2) {
                    Text("${x.job_sheet.totals.volume_m3} m³ · ${x.job_sheet.totals.weight_kg.toInt()} kg", style = MaterialTheme.typography.bodySmall)
                    x.job_sheet.load_order.forEach { LoadLine(it) }
                }
            }
        }
    }
}

@Composable
private fun PlaceRow(label: String, p: com.nagla.app.data.Place) {
    val context = LocalContext.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            Text(p.address ?: "—", style = MaterialTheme.typography.bodyLarge)
            Text(t("الطابق ", "Floor ") + (p.floor ?: "—") + " · " + if (p.has_elevator == true) t("مصعد", "elevator") else t("بدون مصعد", "no elevator"),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        p.navigation_url?.let { url ->
            FilledTonalButton({ context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }) {
                Icon(Icons.Outlined.Navigation, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text(t("انتقل", "Navigate"))
            }
        }
    }
}
