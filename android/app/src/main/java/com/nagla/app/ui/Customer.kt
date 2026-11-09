package com.nagla.app.ui

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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.nagla.app.data.Api
import com.nagla.app.data.MoveRow
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

private fun isRunning(m: MoveRow) = m.status == "confirmed" && m.current_stage !in END_STAGES

@Composable
fun MoveCard(m: MoveRow, onClick: () -> Unit, trailing: (@Composable () -> Unit)? = null) {
    Card(
        Modifier.fillMaxWidth().clickable(onClick = onClick), shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (m.move_no != null) "#${m.move_no}" else "", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.weight(1f))
                StatusBadge(m.status, m.current_stage)
                trailing?.invoke()
            }
            val who = m.customer_name ?: m.company_name ?: if (m.status == "draft") t("مسودة محفوظة", "Saved draft") else null
            if (who != null) Text(who, style = MaterialTheme.typography.titleMedium)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.AltRoute, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.width(6.dp))
                Text((m.pickup_address ?: t("عنوان الاستلام", "Pickup")) + "  ←  " + (m.dropoff_address ?: t("عنوان التسليم", "Delivery")),
                    style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.CalendarMonth, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.width(6.dp))
                Text(dateLine(m.date_from, m.date_to, m.preferred_time), style = MaterialTheme.typography.bodyMedium)
                if (m.price_halalas != null) { Spacer(Modifier.weight(1f)); Text(sar(m.price_halalas), fontWeight = FontWeight.Bold) }
            }
            if (m.assigned_agent_name != null) Text(t("الفني: ", "Technician: ") + m.assigned_agent_name, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
fun CustomerHome(nav: NavHostController, bottom: @Composable () -> Unit) {
    val me = Session.me!!
    val loader = rememberLoader(pollMs = 15_000) { Api.moves() }
    AppScreen(t("مرحباً، ", "Hello, ") + me.name.substringBefore(' '), bottomBar = bottom) { pad ->
        RefreshList(loader, pad) { moves ->
            val live = moves.filter(::isRunning).sortedBy { it.date_from ?: "" }
            val drafts = moves.filter { it.status == "draft" }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile(t("نقل نشط", "Active"), live.size.toString(), Modifier.weight(1f), Icons.Outlined.LocalShipping) { nav.navigate("moves") }
                    StatTile(t("مكتملة", "Completed"), moves.count { it.current_stage == "completed" }.toString(), Modifier.weight(1f), Icons.Outlined.TaskAlt) { nav.navigate("moves") }
                    StatTile(t("مسودات", "Drafts"), drafts.size.toString(), Modifier.weight(1f), Icons.Outlined.EditNote) { nav.navigate("moves") }
                }
            }
            val next = live.firstOrNull()
            item {
                if (next != null) SectionCard(title = t("نقلتك القادمة", "Your next move"), icon = Icons.Outlined.LocalShipping) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        JourneyRing(next.current_stage, next.progress?.percent ?: (MAIN_STAGES.indexOf(next.current_stage).coerceAtLeast(0) * 10), size = 104)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(stageName(next.current_stage), style = MaterialTheme.typography.titleMedium)
                            Text(dateLine(next.date_from, next.date_to, next.preferred_time), style = MaterialTheme.typography.bodyMedium)
                            Text("#${next.move_no}", color = MaterialTheme.colorScheme.primary)
                        }
                    }
                    PrimaryButton(t("تتبّع النقل", "Track the move"), { nav.navigate("move/${next.id}") }, Modifier.fillMaxWidth(), icon = Icons.Outlined.MyLocation)
                } else SectionCard {
                    EmptyState(t("لا توجد نقلة قادمة", "No upcoming move"), t("خطط لنقلتك: الموعد، الصور، ثم الأسعار.", "Plan your move: date, photos, then prices."), Icons.Outlined.Home) {
                        PrimaryButton(t("ابدأ نقلتك", "Start your move"), { nav.navigate("book") }, icon = Icons.Outlined.Add)
                    }
                }
            }
            if (drafts.isNotEmpty()) {
                item { Text(t("أكمل مسوداتك", "Continue a draft"), style = MaterialTheme.typography.titleLarge) }
                items(drafts.take(3), key = { it.id }) { m -> MoveCard(m, { nav.navigate("book/${m.id}") }) }
            }
            val recent = moves.filter { it.status != "draft" }.take(4)
            if (recent.isNotEmpty()) {
                item { Text(t("آخر الطلبات", "Recent moves"), style = MaterialTheme.typography.titleLarge) }
                items(recent, key = { "r" + it.id }) { m -> MoveCard(m, { nav.navigate("move/${m.id}") }) }
            }
        }
    }
}

@Composable
fun CustomerMoves(nav: NavHostController, bottom: @Composable () -> Unit) {
    var filter by remember { mutableStateOf("all") }
    val loader = rememberLoader(pollMs = 20_000) { Api.moves() }
    val scope = rememberCoroutineScope()
    var error by remember { mutableStateOf<String?>(null) }
    AppScreen(t("طلباتي", "My moves"), bottomBar = bottom, actions = {
        IconButton({ nav.navigate("archive") }) { Icon(Icons.Outlined.Inventory2, t("الأرشيف", "Archive")) }
    }) { pad ->
        RefreshList(loader, pad) { all ->
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("all" to t("الكل", "All"), "draft" to t("مسودات", "Drafts"), "active" to t("نشطة", "Active"), "done" to t("منتهية", "Finished")).forEach { (k, label) ->
                        FilterChip(filter == k, { filter = k }, { Text(label) })
                    }
                }
            }
            item { ErrorNote(error) }
            val list = all.filter {
                when (filter) {
                    "draft" -> it.status == "draft"
                    "active" -> isRunning(it)
                    "done" -> it.status != "draft" && !isRunning(it)
                    else -> true
                }
            }
            if (list.isEmpty()) item { EmptyState(t("لا توجد طلبات هنا", "No moves here")) }
            items(list, key = { it.id }) { m ->
                MoveCard(m, { nav.navigate(if (m.status == "draft") "book/${m.id}" else "move/${m.id}") }) {
                    if (!isRunning(m)) IconButton({
                        scope.launch { runCatching { Api.archive(m.id) }.onFailure { error = errorText(it) }; loader.reload(true) }
                    }) { Icon(Icons.Outlined.Archive, t("أرشفة", "Archive")) }
                }
            }
        }
    }
}

@Composable
fun ArchiveScreen(nav: NavHostController) {
    val loader = rememberLoader { Api.moves("archived") }
    val scope = rememberCoroutineScope()
    AppScreen(t("الأرشيف", "Archive"), onBack = { nav.popBackStack() }) { pad ->
        RefreshList(loader, pad) { list ->
            item { Text(t("المسودات والطلبات المنتهية التي أرشفتها. المسودات المؤرشفة تُحذف بعد ٤٨ ساعة دون تعديل.",
                "Drafts and finished moves you archived. Archived drafts are deleted after 48 hours without changes."),
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            if (list.isEmpty()) item { EmptyState(t("الأرشيف فارغ", "The archive is empty"), icon = Icons.Outlined.Inventory2) }
            items(list, key = { it.id }) { m ->
                MoveCard(m, { nav.navigate(if (m.status == "draft") "book/${m.id}" else "move/${m.id}") }) {
                    IconButton({ scope.launch { runCatching { Api.unarchive(m.id) }; loader.reload(true) } }) { Icon(Icons.Outlined.Unarchive, t("إلغاء الأرشفة", "Unarchive")) }
                    if (m.status == "draft") IconButton({ scope.launch { runCatching { Api.deleteMove(m.id) }; loader.reload(true) } }) {
                        Icon(Icons.Outlined.DeleteOutline, t("حذف", "Delete"), tint = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }
}

/** one move, for the customer (tracking) and the company admin (manage) */
@Composable
fun MoveDetailScreen(nav: NavHostController, id: String) {
    val me = Session.me!!
    val company = me.role == "company_admin"
    val loader = rememberLoader(id, pollMs = 8_000) {
        coroutineScope {
            val m = async { Api.move(id) }
            val tr = async { Api.tracking(id) }
            val msgs = async { runCatching { Api.messages(id) }.getOrDefault(emptyList()) }
            val agents = async { if (company) runCatching { Api.agents() }.getOrDefault(emptyList()) else emptyList() }
            val move = m.await()
            val ratings = if (move.current_stage == "completed") runCatching { Api.ratings(id) }.getOrDefault(emptyList()) else emptyList()
            MoveBundle(move, tr.await(), msgs.await(), agents.await(), ratings)
        }
    }
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmCancel by remember { mutableStateOf(false) }
    var sheet by remember { mutableStateOf<com.nagla.app.data.FullJobSheet?>(null) }
    fun act(block: suspend () -> Unit) {
        busy = true; error = null
        scope.launch { try { block(); loader.reload(true) } catch (e: Exception) { error = errorText(e) } finally { busy = false } }
    }
    val title = loader.data?.move?.let { "#${it.move_no}" } ?: t("الطلب", "Move")
    AppScreen(title, onBack = { nav.popBackStack() }) { pad ->
        RefreshList(loader, pad) { b ->
            val m = b.move
            val stage = m.current_stage
            if (m.status == "draft") { item { LaunchedEffect(Unit) { nav.navigate("book/${m.id}") { popUpTo("move/$id") { inclusive = true } } } }; return@RefreshList }
            val open = stage !in END_STAGES
            val beforeCrew = MAIN_STAGES.indexOf(stage) < MAIN_STAGES.indexOf("on_the_way")
            item {
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (stage == "rejected" || stage == "cancelled") Icon(Icons.Outlined.Block, null, Modifier.size(64.dp), tint = MaterialTheme.colorScheme.error)
                        else JourneyRing(stage, b.tracking.progress?.percent ?: 0, size = 112)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            StatusBadge(m.status, stage)
                            Text(stageName(stage), style = MaterialTheme.typography.titleLarge)
                            Text(if (company) m.customer?.name ?: "" else m.company?.name_en ?: "", style = MaterialTheme.typography.bodyMedium)
                            m.technician?.let { Text(t("الفني: ", "Technician: ") + it.name, style = MaterialTheme.typography.bodyMedium) }
                        }
                    }
                    ErrorNote(error)
                    if (company && stage == "confirmed") Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        PrimaryButton(t("قبول الطلب", "Accept"), { act { Api.setStage(id, "accepted") } }, Modifier.weight(1f), busy = busy, icon = Icons.Outlined.Check)
                        OutlinedButton({ act { Api.setStage(id, "rejected") } }, Modifier.weight(1f).heightIn(min = 52.dp), enabled = !busy) { Text(t("رفض", "Reject"), color = MaterialTheme.colorScheme.error) }
                    }
                    if (company) OutlinedButton({ scope.launch { sheet = runCatching { Api.jobSheet(id) }.getOrNull() } }, Modifier.fillMaxWidth()) {
                        Icon(Icons.Outlined.Description, null); Spacer(Modifier.width(6.dp)); Text(t("ورقة العمل", "Job sheet"))
                    }
                    if (open && beforeCrew) TextButton({ confirmCancel = true }, Modifier.align(Alignment.End)) { Text(t("إلغاء الطلب", "Cancel move"), color = MaterialTheme.colorScheme.error) }
                }
            }
            if (company && stage in setOf("accepted", "crew_assigned")) item { AssignCard(b, busy) { agent -> act { Api.assign(id, agent) } } }
            // chat is open as soon as the move is confirmed (the company replies until a technician is assigned)
            if (m.status == "confirmed") item {
                val last = b.messages.lastOrNull()
                SectionCard(title = if (company) t("المحادثة مع العميل", "Chat with the client") else t("المحادثة مع فريق النقل", "Chat with your moving team"),
                    icon = Icons.AutoMirrored.Outlined.Chat) {
                    Text(last?.let { (it.sender_name ?: roleName(it.sender_role)) + ": " + it.body }
                        ?: if (!company && m.technician == null) t("اكتب للشركة الآن، وسينضم الفني عند تعيينه.", "Write to the company now; your technician joins once assigned.")
                        else t("لا توجد رسائل بعد.", "No messages yet."),
                        style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    PrimaryButton(t("فتح المحادثة", "Open chat") + if (b.messages.isNotEmpty()) " (${b.messages.size})" else "", { nav.navigate("chat/$id") }, Modifier.fillMaxWidth(), icon = Icons.AutoMirrored.Outlined.Chat)
                }
            }
            if (!company && stage == "completed" && m.technician != null) item {
                val mine = b.ratings.firstOrNull { it.rater_role == "customer" }
                if (mine != null) SectionCard(title = t("تقييمك", "Your rating"), icon = Icons.Outlined.StarOutline) { Text(stars(mine.stars) + (mine.comment?.let { " · $it" } ?: "")) }
                else RateCard(t("قيّم الخدمة", "Rate the service")) { s, c -> act { Api.rateService(id, s, c) } }
            }
            item {
                SectionCard(title = t("تتبّع النقل", "Track the move"), icon = Icons.Outlined.AltRoute) {
                    if (stage == "rejected" || stage == "cancelled") Text(stageName(stage), color = MaterialTheme.colorScheme.error)
                    else StageTimeline(MAIN_STAGES, stage, b.tracking.events.filter { it.skipped }.map { it.stage }.toSet())
                }
            }
            item { MoveFacts(m) }
            m.quote?.let { q -> item {
                SectionCard(title = t("السعر المؤكد", "Confirmed price"), icon = Icons.Outlined.Payments) {
                    InfoRow(t("الشاحنة", "Truck"), "${q.truck_name} × ${q.trips}", Icons.Outlined.LocalShipping)
                    InfoRow(t("العمال", "Crew"), q.crew_size.toString(), Icons.Outlined.Groups)
                    InfoRow(t("المدة", "Time"), "~${q.estimated_minutes} " + t("دقيقة", "min"), Icons.Outlined.Schedule)
                    HorizontalDivider()
                    Row { Text(t("الإجمالي", "Total"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f)); Text(sar(q.price_halalas), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary) }
                }
            } }
            item { ItemsSummary(m.items) }
        }
    }
    if (confirmCancel) AlertDialog(
        onDismissRequest = { confirmCancel = false },
        title = { Text(t("إلغاء الطلب؟", "Cancel this move?")) },
        text = { Text(t("لا يمكن التراجع عن الإلغاء.", "This can't be undone.")) },
        confirmButton = { TextButton({ confirmCancel = false; act { Api.cancel(id) } }) { Text(t("نعم، ألغِ", "Yes, cancel"), color = MaterialTheme.colorScheme.error) } },
        dismissButton = { TextButton({ confirmCancel = false }) { Text(t("رجوع", "Back")) } },
    )
    sheet?.let { s -> JobSheetDialog(s) { sheet = null } }
}

data class MoveBundle(
    val move: com.nagla.app.data.MoveDetail, val tracking: com.nagla.app.data.Tracking, val messages: List<com.nagla.app.data.Message>,
    val agents: List<com.nagla.app.data.Agent>, val ratings: List<com.nagla.app.data.Rating>,
)

@Composable
fun MoveFacts(m: com.nagla.app.data.MoveDetail) {
    SectionCard(title = t("تفاصيل النقل", "Moving details"), icon = Icons.Outlined.Info) {
        AddressBlock(t("من", "From"), m.pickup_address, m.pickup_details, m.pickup_floor, m.pickup_has_elevator)
        HorizontalDivider()
        AddressBlock(t("إلى", "To"), m.dropoff_address, m.dropoff_details, m.dropoff_floor, m.dropoff_has_elevator)
        HorizontalDivider()
        InfoRow(t("الموعد", "Date"), dateLine(m.date_from, m.date_to, m.preferred_time), Icons.Outlined.CalendarMonth)
        if (!m.notes.isNullOrBlank()) InfoRow(t("ملاحظات", "Notes"), m.notes, Icons.Outlined.StickyNote2)
    }
}

@Composable
fun AddressBlock(label: String, address: String?, d: com.nagla.app.data.AddressDetails?, floor: Int?, elevator: Boolean?) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        Text(address ?: "—", style = MaterialTheme.typography.bodyLarge)
        val parts = listOfNotNull(
            d?.district, d?.street, d?.building_number?.let { t("مبنى ", "Bldg ") + it }, d?.postal_code, d?.short_code?.let { t("العنوان المختصر ", "Short code ") + it },
        )
        if (parts.isNotEmpty()) Text(parts.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(t("الطابق ", "Floor ") + (floor ?: "—") + " · " + if (elevator == true) t("يوجد مصعد", "elevator") else t("بدون مصعد", "no elevator"),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun ItemsSummary(items: List<com.nagla.app.data.Item>) {
    SectionCard(title = t("الأغراض", "Items") + " (${items.sumOf { it.quantity }})", icon = Icons.Outlined.Inventory2) {
        if (items.isEmpty()) Text(t("لا توجد أغراض.", "No items."))
        items.forEach { i ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(t(i.name_ar, i.name_en) + if (i.quantity > 1) " × ${i.quantity}" else "", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                if (i.fragile) Icon(Icons.Outlined.WineBar, t("قابل للكسر", "fragile"), Modifier.size(16.dp), tint = MaterialTheme.colorScheme.error)
                Spacer(Modifier.width(8.dp))
                Text(dispositionName(i.disposition), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
fun AssignCard(b: MoveBundle, busy: Boolean, onAssign: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    SectionCard(title = t("الفني المسؤول", "Technician"), icon = Icons.Outlined.Engineering) {
        if (b.agents.isEmpty()) Text(t("أضف فنياً أولاً من تبويب الفنيين.", "Add a technician first on the Technicians tab."))
        else {
            Text(b.move.technician?.name ?: t("لم يُعيّن بعد", "Not assigned yet"), style = MaterialTheme.typography.titleMedium)
            Box {
                PrimaryButton(if (b.move.technician == null) t("تعيين فني", "Assign a technician") else t("تغيير الفني", "Change technician"), { open = true }, Modifier.fillMaxWidth(), busy = busy, icon = Icons.Outlined.PersonAdd)
                DropdownMenu(open, { open = false }) {
                    b.agents.forEach { a -> DropdownMenuItem({ Text(a.name) }, { open = false; onAssign(a.id) }, leadingIcon = { Icon(Icons.Outlined.Person, null) }) }
                }
            }
        }
    }
}

@Composable
fun RateCard(title: String, onRate: (Int, String?) -> Unit) {
    var stars by remember { mutableIntStateOf(5) }
    var comment by remember { mutableStateOf("") }
    SectionCard(title = title, icon = Icons.Outlined.StarOutline) {
        StarsInput(stars) { stars = it }
        OutlinedTextField(comment, { comment = it.take(1000) }, label = { Text(t("تعليق (اختياري)", "Comment (optional)")) }, modifier = Modifier.fillMaxWidth())
        PrimaryButton(t("إرسال التقييم", "Send rating"), { onRate(stars, comment) }, Modifier.fillMaxWidth())
    }
}

@Composable
fun JobSheetDialog(s: com.nagla.app.data.FullJobSheet, onClose: () -> Unit) {
    AlertDialog(onDismissRequest = onClose, confirmButton = { TextButton(onClose) { Text(t("إغلاق", "Close")) } },
        title = { Text(t("ورقة العمل", "Job sheet")) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                InfoRow(t("القطع", "Items"), s.totals.items.toString())
                InfoRow(t("الحجم", "Volume"), "${s.totals.volume_m3} m³")
                InfoRow(t("الوزن", "Weight"), "${s.totals.weight_kg.toInt()} kg")
                InfoRow(t("وقت الفك", "Dismantling"), "${s.totals.dismantle_minutes} " + t("دقيقة", "min"))
                HorizontalDivider()
                s.load_order.forEach { i -> LoadLine(i) }
            }
        })
}

@Composable
fun LoadLine(i: com.nagla.app.data.LoadItem) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("${i.step}. " + t(i.name_ar, i.name_en) + if (i.quantity > 1) " × ${i.quantity}" else "", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text(listOfNotNull(if (i.dismantle) t("فك", "dismantle") else null, if (i.heavy) t("ثقيل", "heavy") else null, if (i.fragile) t("قابل للكسر", "fragile") else null).joinToString(" · "),
            style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
