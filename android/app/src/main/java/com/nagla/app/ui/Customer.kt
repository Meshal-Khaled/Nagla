package com.nagla.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
    AppScreen("", bottomBar = bottom, showTopBar = false) { pad ->
        RefreshList(loader, PaddingValues(top = pad.calculateTopPadding() + 8.dp, bottom = pad.calculateBottomPadding())) { moves ->
            val live = moves.filter(::isRunning).sortedBy { it.date_from ?: "" }
            val drafts = moves.filter { it.status == "draft" }
            // header: logo at the start, the profile at the end
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(com.nagla.app.R.drawable.logo_lockup), "نقلة Naqla",
                        Modifier.height(40.dp).clip(MaterialTheme.shapes.small))
                    Spacer(Modifier.weight(1f))
                    Surface(onClick = { nav.navigate("profile") { popUpTo("home") { saveState = true }; launchSingleTop = true; restoreState = true } }, shape = CircleShape, color = MaterialTheme.colorScheme.surface,
                        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                        Box(Modifier.size(44.dp), Alignment.Center) { Icon(Icons.Outlined.Person, t("الملف", "Profile"), tint = MaterialTheme.colorScheme.onSurface) }
                    }
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(t("يا هلا، ", "Hello, ") + me.name.substringBefore(' '), style = MaterialTheme.typography.headlineMedium)
                    Text(t("خطوة بخطوة، لبيتك الجديد.", "Step by step, to your new home."), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            item {
                HeroCard {
                    Text(t("كل نقلة، بداية جديدة", "Every move, a new start"), style = MaterialTheme.typography.labelLarge, color = Brand.Lime)
                    Text(t("من أول قرار،\nلين تستقر في الدار.", "From the first decision\nto settling in."), style = MaterialTheme.typography.headlineMedium, color = Color.White)
                    PrimaryButton(t("ابدأ نقلة جديدة", "Start a new move"), { nav.navigate("book") }, Modifier.fillMaxWidth(), icon = Icons.Outlined.Add)
                }
            }
            val next = live.firstOrNull()
            if (next != null) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(t("نقلتك القادمة", "Your next move"), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                        Text("#${next.move_no}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                item { NextMoveCard(next) { nav.navigate("move/${next.id}") } }
            }
            if (drafts.isNotEmpty()) {
                item { Text(t("نكمل من وين وقفنا؟", "Pick up where you left off?"), style = MaterialTheme.typography.titleLarge) }
                items(drafts.take(3), key = { it.id }) { m -> DraftRow(m) { nav.navigate("book/${m.id}") } }
            }
            val recent = moves.filter { it.status != "draft" && it.id != next?.id }.take(3)
            if (recent.isNotEmpty()) {
                item { Text(t("آخر الطلبات", "Recent moves"), style = MaterialTheme.typography.titleLarge) }
                items(recent, key = { "r" + it.id }) { m -> MoveCard(m, { nav.navigate("move/${m.id}") }) }
            }
        }
    }
}

/** the next move: big date, time, status, the route, and "follow your move" */
@Composable
private fun NextMoveCard(m: MoveRow, onOpen: () -> Unit) {
    SectionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            DateBadge(m.date_from)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(dayMonthText(m.date_from), style = MaterialTheme.typography.titleMedium)
                Text(t("الموعد المفضّل", "Preferred time") + (m.preferred_time?.let { " · " + time12(it) } ?: ""),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (m.assigned_agent_name != null) CheckChip(t("تم تعيين الفني", "Technician assigned")) else StatusBadge(m.status, m.current_stage)
        RouteLines(m.pickup_address, m.dropoff_address)
        OutlinedButton(onOpen, Modifier.fillMaxWidth().heightIn(min = 52.dp), shape = MaterialTheme.shapes.medium,
            border = androidx.compose.foundation.BorderStroke(1.5.dp, Brand.Navy)) {
            Text(t("تابع نقلتك", "Follow your move"), color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.width(8.dp))
            Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, tint = MaterialTheme.colorScheme.onSurface)
        }
    }
}

/** a saved draft: what it is and where it stopped */
@Composable
private fun DraftRow(m: MoveRow, onOpen: () -> Unit) {
    val where = when {
        m.date_from == null || m.pickup_address == null -> t("الموعد والعناوين", "date & addresses")
        (m.item_count ?: 0) == 0 -> t("الصور والمسح", "photos & scan")
        else -> t("مراجعة الأغراض", "reviewing items")
    }
    Card(Modifier.fillMaxWidth().clickable(onClick = onOpen), shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(44.dp).clip(MaterialTheme.shapes.medium).background(MaterialTheme.colorScheme.background), Alignment.Center) {
                Icon(Icons.Outlined.Edit, null, tint = MaterialTheme.colorScheme.onSurface)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(t("نقلة", "Move") + (m.move_no?.let { " #$it" } ?: ""), style = MaterialTheme.typography.titleMedium)
                Text(t("مسودة محفوظة · ", "Saved draft · ") + where, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
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
    val title = loader.data?.move?.let { if (company) "#${it.move_no}" else t("تتبّع النقلة #", "Track move #") + it.move_no } ?: t("الطلب", "Move")
    val bundle = loader.data
    AppScreen(title, onBack = { nav.popBackStack() }, bottomBar = {
        // the chat is one tap away while the move is on
        if (bundle != null && bundle.move.status == "confirmed") Surface(shadowElevation = 8.dp, color = MaterialTheme.colorScheme.surface) {
            PrimaryButton(
                (if (company) t("المحادثة مع العميل", "Chat with the customer") else t("محادثة فريق النقل", "Chat with the moving team")) +
                    if (bundle.messages.isNotEmpty()) " (${bundle.messages.size})" else "",
                { nav.navigate("chat/$id") }, Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp),
                icon = Icons.AutoMirrored.Outlined.Chat,
            )
        }
    }) { pad ->
        RefreshList(loader, pad) { b ->
            val m = b.move
            val stage = m.current_stage
            if (m.status == "draft") { item { LaunchedEffect(Unit) { nav.navigate("book/${m.id}") { popUpTo("move/$id") { inclusive = true } } } }; return@RefreshList }
            val open = stage !in END_STAGES
            val beforeCrew = MAIN_STAGES.indexOf(stage) < MAIN_STAGES.indexOf("on_the_way")
            val ended = stage == "rejected" || stage == "cancelled"
            item {
                if (ended) SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Block, null, Modifier.size(40.dp), tint = MaterialTheme.colorScheme.error)
                        Spacer(Modifier.width(12.dp))
                        Text(stageName(stage), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.error)
                    }
                } else StageHeroCard(stage, b.tracking.progress?.percent ?: 0, clockText(b.tracking.events.lastOrNull()?.created_at))
            }
            // company: accept / reject, the job sheet; anyone: cancel before the crew sets off
            if (company || (open && beforeCrew)) item {
                SectionCard {
                    if (company) Text(m.customer?.name ?: "", style = MaterialTheme.typography.titleMedium)
                    ErrorNote(error)
                    if (company && stage == "confirmed") Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        PrimaryButton(t("قبول الطلب", "Accept"), { act { Api.setStage(id, "accepted") } }, Modifier.weight(1f), busy = busy, icon = Icons.Outlined.Check)
                        OutlinedButton({ act { Api.setStage(id, "rejected") } }, Modifier.weight(1f).heightIn(min = 54.dp), enabled = !busy) { Text(t("رفض", "Reject"), color = MaterialTheme.colorScheme.error) }
                    }
                    if (company) OutlinedButton({ scope.launch { sheet = runCatching { Api.jobSheet(id) }.getOrNull() } }, Modifier.fillMaxWidth()) {
                        Icon(Icons.Outlined.Description, null); Spacer(Modifier.width(6.dp)); Text(t("ورقة العمل", "Job sheet"))
                    }
                    if (open && beforeCrew) TextButton({ confirmCancel = true }, Modifier.align(Alignment.End)) { Text(t("إلغاء الطلب", "Cancel move"), color = MaterialTheme.colorScheme.error) }
                }
            }
            if (company && stage in setOf("accepted", "crew_assigned")) item { AssignCard(b, busy) { agent -> act { Api.assign(id, agent) } } }
            if (!ended) item { StepsCard(stage, b.tracking.events) }
            item {
                SectionCard(title = t("من دار لدار", "Door to door"), icon = Icons.Outlined.Place) {
                    fun sub(d: com.nagla.app.data.AddressDetails?, floor: Int?, lift: Boolean?) = listOfNotNull(
                        d?.district, d?.street, d?.building_number?.let { t("مبنى ", "Bldg ") + it },
                        t("الطابق ", "Floor ") + (floor ?: 0), if (lift == true) t("مصعد", "elevator") else null,
                    ).joinToString(" · ")
                    RouteLines(m.pickup_address, m.dropoff_address, t("الاستلام", "Pickup"), t("التسليم", "Delivery"),
                        sub(m.pickup_details, m.pickup_floor, m.pickup_has_elevator), sub(m.dropoff_details, m.dropoff_floor, m.dropoff_has_elevator))
                    InfoRow(t("الموعد", "Date"), dateLine(m.date_from, m.date_to, m.preferred_time), Icons.Outlined.CalendarMonth)
                    if (!m.notes.isNullOrBlank()) InfoRow(t("ملاحظات", "Notes"), m.notes, Icons.Outlined.StickyNote2)
                }
            }
            if (!ended) item {
                Text(t("تظهر هنا تحديثات المراحل التي يرسلها الفريق.", "Stage updates from the team show up here."),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            m.technician?.let { tech -> item {
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Initial(tech.name)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(tech.name, style = MaterialTheme.typography.titleMedium)
                            Text(t("الفني المسؤول", "Technician in charge") + (m.company?.name_en?.let { " · $it" } ?: ""),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Icon(Icons.Outlined.Groups, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            } }
            if (!company && stage == "completed" && m.technician != null) item {
                val mine = b.ratings.firstOrNull { it.rater_role == "customer" }
                if (mine != null) SectionCard(title = t("تقييمك", "Your rating"), icon = Icons.Outlined.StarOutline) { Text(stars(mine.stars) + (mine.comment?.let { " · $it" } ?: "")) }
                else RateCard(t("قيّم الخدمة", "Rate the service")) { s, c -> act { Api.rateService(id, s, c) } }
            }
            m.quote?.let { q -> item {
                SectionCard(title = t("السعر المؤكد", "Confirmed price"), icon = Icons.Outlined.Payments) {
                    InfoRow(t("الشاحنة", "Truck"), truckName(q.truck_name) + " · " + tripsText(q.trips), Icons.Outlined.LocalShipping)
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

@Composable
private fun StepsCard(stage: String?, events: List<com.nagla.app.data.Event>) {
    var all by remember { mutableStateOf(false) }
    val idx = MAIN_STAGES.indexOf(stage)
    val at = events.associateBy { it.stage }
    val skipped = events.filter { it.skipped }.map { it.stage }.toSet()
    val doneCount = if (stage == "completed") MAIN_STAGES.size else idx.coerceAtLeast(0)
    SectionCard(title = t("خطوات نقلتك", "Your move's steps")) {
        Text(t("$doneCount مراحل سابقة مكتملة", "$doneCount earlier stages done"), style = MaterialTheme.typography.bodySmall, color = Brand.TealDark)
        if (all) StageTimeline(MAIN_STAGES, stage, skipped)
        else (listOf(idx - 1, idx, idx + 1).filter { it in MAIN_STAGES.indices }).forEach { i ->
            val s = MAIN_STAGES[i]
            val done = i < idx || stage == "completed"
            val now = i == idx && stage != "completed"
            Row(Modifier.fillMaxWidth().heightIn(min = 44.dp), verticalAlignment = Alignment.CenterVertically) {
                when {
                    done -> Box(Modifier.size(22.dp).clip(CircleShape).background(Brand.TealDark), Alignment.Center) { Icon(Icons.Outlined.Check, null, Modifier.size(14.dp), tint = Color.White) }
                    now -> Box(Modifier.size(22.dp).clip(CircleShape).border(2.dp, Brand.TealDark, CircleShape), Alignment.Center) { Box(Modifier.size(10.dp).clip(CircleShape).background(Brand.TealDark)) }
                    else -> Box(Modifier.size(22.dp).clip(CircleShape).border(2.dp, MaterialTheme.colorScheme.outline, CircleShape))
                }
                Spacer(Modifier.width(12.dp))
                Text(stageName(s), Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge, fontWeight = if (now) FontWeight.Bold else FontWeight.Normal,
                    color = if (done || now) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
                Text(at[s]?.let { clockText(it.created_at) } ?: if (!done && !now) t("التالي", "Next") else "",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        TextButton({ all = !all }) {
            Text(if (all) t("عرض أقل", "Show less") else t("عرض جميع المراحل", "Show all stages"))
            Icon(if (all) Icons.Outlined.ExpandLess else Icons.AutoMirrored.Outlined.KeyboardArrowLeft, null, Modifier.size(18.dp))
        }
    }
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
