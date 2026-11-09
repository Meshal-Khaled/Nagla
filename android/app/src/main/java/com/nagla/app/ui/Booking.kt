package com.nagla.app.ui

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.selectable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
import com.nagla.app.BuildConfig
import com.nagla.app.data.Api
import com.nagla.app.data.CatalogRow
import com.nagla.app.data.MoveDetail
import com.nagla.app.data.Offer
import com.nagla.app.data.SavedAddress
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

private val STEPS = listOf(
    "الموعد" to "Date",
    "الصور" to "Photos",
    "الأغراض" to "Items",
    "العروض" to "Offers",
)

/** 3 → "٣" in Arabic */
private fun num(n: Int): String = if (com.nagla.app.data.Prefs.lang == "ar") n.toString().map { "٠١٢٣٤٥٦٧٨٩"[it - '0'] }.joinToString("") else n.toString()

/** room templates for "Add a room": key, Arabic, English, icon */
private data class RoomTemplate(val key: String, val ar: String, val en: String, val icon: ImageVector)
private val ROOM_TEMPLATES = listOf(
    RoomTemplate("living_room", "غرفة المعيشة", "Living room", Icons.Outlined.Weekend),
    RoomTemplate("majlis", "المجلس", "Majlis", Icons.Outlined.Chair),
    RoomTemplate("bedroom", "غرفة النوم", "Bedroom", Icons.Outlined.Bed),
    RoomTemplate("kids_room", "غرفة الأطفال", "Kids' room", Icons.Outlined.ChildCare),
    RoomTemplate("kitchen", "المطبخ", "Kitchen", Icons.Outlined.Kitchen),
    RoomTemplate("dining_room", "غرفة الطعام", "Dining room", Icons.Outlined.TableRestaurant),
    RoomTemplate("bathroom", "دورة المياه", "Bathroom", Icons.Outlined.Bathtub),
    RoomTemplate("office", "المكتب", "Office", Icons.Outlined.Work),
    RoomTemplate("laundry", "غرفة الغسيل", "Laundry", Icons.Outlined.LocalLaundryService),
    RoomTemplate("storage", "المخزن", "Storage", Icons.Outlined.Inventory2),
    RoomTemplate("outdoor", "الحوش والسطح", "Yard & roof", Icons.Outlined.Yard),
    RoomTemplate("other", "غرفة أخرى", "Other room", Icons.Outlined.MeetingRoom),
)

/** the same slug the API stores ("Bedroom 2" → "bedroom_2", Arabic letters kept) */
private fun roomSlug(name: String) = name.trim().lowercase().replace(Regex("[^a-z0-9؀-ۿ]+"), "_").trim('_')

/** the 3x3 grid cell of a photo, in words (the photo's own left/right) */
fun cellName(cell: Int): String = when (cell) {
    1 -> t("أعلى اليسار", "top left"); 2 -> t("أعلى الوسط", "top centre"); 3 -> t("أعلى اليمين", "top right")
    4 -> t("يسار الوسط", "middle left"); 5 -> t("الوسط", "centre"); 6 -> t("يمين الوسط", "middle right")
    7 -> t("أسفل اليسار", "bottom left"); 8 -> t("أسفل الوسط", "bottom centre"); else -> t("أسفل اليمين", "bottom right")
}

/**
 * New move, in four steps: 1 date + addresses (location, search, map), 2 rooms and their photos (camera / gallery)
 * with the AI scan on Next, 3 items (check each one on its photo, rename, quantity, sell/move/donate), 4 prices.
 * A bottom bar has Back and Next on every step. The move exists on the server from step 2; leaving asks to save the
 * draft or discard it.
 */
@Composable
fun BookingScreen(nav: NavHostController, startId: String?) {
    val scope = rememberCoroutineScope()
    var moveId by rememberSaveable { mutableStateOf(startId) }
    var move by remember { mutableStateOf<MoveDetail?>(null) }
    var step by rememberSaveable { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var uploading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var askLeave by remember { mutableStateOf(false) }
    var askRescan by remember { mutableStateOf(false) }
    var debugSheet by remember { mutableStateOf(false) }
    var scanning by remember { mutableStateOf(false) }
    var chosen by remember { mutableStateOf<Offer?>(null) }
    var askConfirm by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf<List<SavedAddress>>(emptyList()) }

    // step 1 form
    val pickup = remember { AddressState() }
    val dropoff = remember { AddressState() }
    var dateFrom by rememberSaveable { mutableStateOf<String?>(null) }
    var dateTo by rememberSaveable { mutableStateOf<String?>(null) }
    var time by rememberSaveable { mutableStateOf<String?>(null) }
    var notes by rememberSaveable { mutableStateOf("") }

    suspend fun refresh() { moveId?.let { move = Api.move(it) } }

    LaunchedEffect(Unit) {
        saved = runCatching { Api.addresses() }.getOrDefault(emptyList())
        if (startId != null) runCatching { Api.move(startId) }.onSuccess { m ->
            if (m.status != "draft") { nav.navigate("move/${m.id}") { popUpTo("book/$startId") { inclusive = true } }; return@onSuccess }
            move = m
            pickup.load(m.pickup_address, m.pickup_lat, m.pickup_lng, m.pickup_floor, m.pickup_has_elevator, m.pickup_details)
            dropoff.load(m.dropoff_address, m.dropoff_lat, m.dropoff_lng, m.dropoff_floor, m.dropoff_has_elevator, m.dropoff_details)
            dateFrom = m.date_from; dateTo = m.date_to; time = m.preferred_time?.take(5); notes = m.notes ?: ""
            step = when { m.date_from == null || m.pickup_address == null -> 0; m.photos.isEmpty() || m.items.isEmpty() -> 1; else -> 2 }
        }.onFailure { error = errorText(it) }
    }

    fun leave() {
        val m = move
        if (m != null && !m.draft_saved) askLeave = true else nav.popBackStack()
    }
    fun back() { if (scanning) return; if (step > 0) { step--; error = null } else leave() }
    BackHandler { back() }

    fun run(block: suspend () -> Unit) {
        busy = true; error = null
        scope.launch { try { block() } catch (e: Exception) { error = errorText(e) } finally { busy = false } }
    }

    // step 1 → create the draft (if needed) and store date + addresses
    fun saveDetails() = run {
        val id = moveId ?: Api.createMove().id.also { moveId = it }
        move = Api.patchMove(id, Api.obj(
            "pickup_address" to pickup.address.trim(), "pickup_lat" to pickup.lat, "pickup_lng" to pickup.lng,
            "pickup_floor" to (pickup.floor.toIntOrNull() ?: 0), "pickup_has_elevator" to pickup.elevator,
            "pickup_details" to Api.json.encodeToJsonElement(com.nagla.app.data.AddressDetails.serializer(), pickup.details()),
            "dropoff_address" to dropoff.address.trim(), "dropoff_lat" to dropoff.lat, "dropoff_lng" to dropoff.lng,
            "dropoff_floor" to (dropoff.floor.toIntOrNull() ?: 0), "dropoff_has_elevator" to dropoff.elevator,
            "dropoff_details" to Api.json.encodeToJsonElement(com.nagla.app.data.AddressDetails.serializer(), dropoff.details()),
            "date_from" to dateFrom, "date_to" to (dateTo ?: dateFrom), "preferred_time" to time, "notes" to notes.trim().ifBlank { null },
        ))
        step = 1
    }

    fun scan() {
        val id = moveId ?: return
        scanning = true; error = null
        scope.launch {
            try {
                val job = Api.plan(id)
                val started = System.currentTimeMillis()
                while (true) {
                    delay(2000)
                    val j = Api.job(job.job_id)
                    if (j.status == "done") break
                    if (j.status == "failed") throw Exception(j.error ?: "scan failed")
                    if (System.currentTimeMillis() - started > 10 * 60_000) throw Exception("timeout")
                }
                refresh(); step = 2
            } catch (e: Exception) {
                error = t("تعذر المسح: ", "Scan failed: ") + errorText(e)
            } finally { scanning = false }
        }
    }

    // step 2 → new photos are scanned; when every photo was already scanned, ask before scanning again
    fun photosNext() {
        val m = move ?: return
        if (m.photos.any { !it.scanned } || m.items.isEmpty()) scan() else askRescan = true
    }

    val m = move
    val nextEnabled = when (step) {
        0 -> dateFrom != null && pickup.complete && dropoff.complete
        1 -> m != null && m.photos.isNotEmpty() && !uploading
        2 -> m != null && m.items.any { it.disposition == "keep" }
        else -> chosen != null
    }
    val nextHint = when (step) {
        0 -> t("أكمل التاريخ والعنوانين للمتابعة.", "Add the date and both addresses to continue.")
        1 -> t("أضف غرفة وصوّرها للمتابعة.", "Add a room and photograph it to continue.")
        2 -> t("حدد قطعة واحدة على الأقل للنقل.", "Mark at least one item as Move.")
        else -> t("اختر شركة للمتابعة.", "Pick a company to continue.")
    }

    AppScreen(t("نقلة جديدة", "New move"), onBack = ::back, actions = {
        if (BuildConfig.DEBUG && step == 2 && moveId != null) IconButton({ debugSheet = true }) { Icon(Icons.Outlined.DataObject, t("مخرجات الذكاء الاصطناعي", "AI output")) }
        if (moveId != null && move?.draft_saved != true) TextButton({ run { Api.saveDraft(moveId!!); refresh() } }) { Text(t("حفظ مسودة", "Save draft")) }
        else if (move?.draft_saved == true) Icon(Icons.Outlined.CloudDone, t("محفوظة", "Saved"), Modifier.padding(end = 12.dp), tint = MaterialTheme.colorScheme.primary)
    }, bottomBar = {
        if (!scanning) StepBar(
            step = step,
            nextLabel = when (step) {
                0 -> t("التالي: الصور", "Next: photos"); 1 -> t("التالي: المسح الذكي", "Next: AI scan"); 2 -> t("التالي: عروض الشركات", "Next: company offers")
                else -> t("مراجعة وتأكيد", "Review & confirm") + (chosen?.let { " · " + sar(it.price_halalas) } ?: "")
            },
            nextIcon = when (step) { 1 -> Icons.Outlined.AutoAwesome; 3 -> Icons.Outlined.Check; else -> Icons.AutoMirrored.Outlined.ArrowForward },
            nextEnabled = nextEnabled, hint = if (!nextEnabled) nextHint else null, busy = busy || uploading,
            onBack = ::back,
            onNext = { when (step) { 0 -> saveDetails(); 1 -> photosNext(); 2 -> step = 3; else -> askConfirm = true } },
            summary = when {
                step == 2 && m != null -> {
                    val keep = m.items.filter { it.disposition == "keep" }.sumOf { it.quantity }
                    val sell = m.items.filter { it.disposition == "sell" }.sumOf { it.quantity }
                    val donate = m.items.filter { it.disposition == "donate" }.sumOf { it.quantity }
                    t("${num(keep)} قطع للنقل", "$keep to move") to listOfNotNull(
                        if (sell > 0) t("${num(sell)} للبيع", "$sell to sell") else null,
                        if (donate > 0) t("${num(donate)} للتبرع", "$donate to donate") else null,
                    ).joinToString(" · ")
                }
                step == 3 -> t("بالتأكيد، يُثبَّت السعر وقائمة الأغراض. بعدها لا يمكن تعديل الأغراض.", "Confirming locks the price and the item list. Items can't be edited after that.") to ""
                else -> null
            },
        )
    }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            Stepper(step) { i -> if (i < step && !scanning) step = i }
            error?.let { Box(Modifier.padding(horizontal = 16.dp)) { ErrorNote(it) } }
            Box(Modifier.weight(1f)) {
                AnimatedContent(step, label = "step") { s ->
                    when (s) {
                        0 -> DetailsStep(pickup, dropoff, saved, dateFrom, { dateFrom = it }, dateTo, { dateTo = it }, time, { time = it }, notes, { notes = it })
                        1 -> PhotosStep(move, scanning, { uploading = it }, onChanged = { scope.launch { runCatching { refresh() } } }, onError = { error = it })
                        2 -> ItemsStep(move, onMove = { move = it }, onError = { error = it })
                        else -> OffersStep(moveId!!, move, chosen) { chosen = it }
                    }
                }
            }
        }
    }

    chosen?.let { o ->
        if (askConfirm) AlertDialog(onDismissRequest = { askConfirm = false },
            icon = { Icon(Icons.Outlined.Lock, null) },
            title = { Text(t("تأكيد الطلب؟", "Confirm your move?")) },
            text = { Text(t("سيُرسل طلبك إلى ${o.company_name} ويُثبّت السعر ${sar(o.price_halalas)}. بعدها لا يمكن تعديل الأغراض.",
                "Your move goes to ${o.company_name} and the price ${sar(o.price_halalas)} is locked. Items can't be edited after this.")) },
            confirmButton = { TextButton({
                askConfirm = false
                run { Api.confirm(moveId!!, o.company_id); nav.navigate("move/$moveId") { popUpTo("home") } }
            }) { Text(t("تأكيد", "Confirm")) } },
            dismissButton = { TextButton({ askConfirm = false }) { Text(t("رجوع", "Back")) } })
    }

    if (askRescan) AlertDialog(
        onDismissRequest = { askRescan = false },
        icon = { Icon(Icons.Outlined.TaskAlt, null) },
        title = { Text(t("تم مسح هذه الصور", "These photos were already scanned")) },
        text = { Text(t("يمكنك المتابعة بالأغراض الحالية، أو مسح الصور من جديد. المسح الجديد يستبدل الأغراض المكتشفة وتعديلاتك عليها.",
            "Continue with the items you have, or scan the photos again. A new scan replaces the detected items and your edits to them.")) },
        confirmButton = { TextButton({ askRescan = false; step = 2 }) { Text(t("متابعة", "Continue")) } },
        dismissButton = { TextButton({ askRescan = false; scan() }) { Text(t("مسح من جديد", "Scan again")) } },
    )

    if (askLeave) AlertDialog(
        onDismissRequest = { askLeave = false },
        title = { Text(t("حفظ المسودة؟", "Save this draft?")) },
        text = { Text(t("إن لم تحفظها، تُحذف المسودة وصورها.", "If you don't save it, the draft and its photos are deleted.")) },
        confirmButton = { TextButton({ askLeave = false; run { Api.saveDraft(moveId!!); nav.popBackStack() } }) { Text(t("حفظ", "Save")) } },
        dismissButton = {
            Row {
                TextButton({ askLeave = false }) { Text(t("متابعة التعديل", "Keep editing")) }
                TextButton({ askLeave = false; run { runCatching { Api.deleteMove(moveId!!) }; nav.popBackStack() } }) { Text(t("حذف", "Discard"), color = MaterialTheme.colorScheme.error) }
            }
        },
    )

    if (debugSheet) moveId?.let { AiDebugSheet(it) { debugSheet = false } }
}

/** the bar pinned under every step: a summary line, then Back and the lime Next (above the navigation bar) */
@Composable
private fun StepBar(
    step: Int, nextLabel: String?, nextIcon: ImageVector, nextEnabled: Boolean, hint: String?, busy: Boolean,
    onBack: () -> Unit, onNext: () -> Unit, summary: Pair<String, String>? = null,
) {
    Surface(shadowElevation = 8.dp, color = MaterialTheme.colorScheme.surface) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (summary != null) Row(verticalAlignment = Alignment.CenterVertically) {
                if (step == 3) { Icon(Icons.Outlined.Lock, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.width(6.dp)) }
                Text(summary.first, style = if (step == 3) MaterialTheme.typography.bodySmall else MaterialTheme.typography.titleSmall,
                    color = if (step == 3) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
                if (summary.second.isNotBlank()) Text(summary.second, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else if (hint != null) Text(hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(onBack, Modifier.heightIn(min = 54.dp), shape = MaterialTheme.shapes.medium, contentPadding = PaddingValues(horizontal = 16.dp)) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
                    Text(if (step == 0) t("إلغاء", "Cancel") else t("السابق", "Back"))
                }
                if (nextLabel != null) PrimaryButton(nextLabel, onNext, Modifier.weight(1f), enabled = nextEnabled, busy = busy, icon = nextIcon)
            }
        }
    }
}

@Composable
private fun Stepper(step: Int, onPick: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        STEPS.forEachIndexed { i, (ar, en) ->
            val done = i < step
            Column(Modifier.weight(1f).clickable(enabled = done, role = Role.Tab, onClickLabel = t("العودة لهذه الخطوة", "Go back to this step")) { onPick(i) }.padding(top = 2.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp))
                    .background(when { done -> Brand.Teal; i == step -> Brand.Navy; else -> MaterialTheme.colorScheme.outlineVariant }))
                Spacer(Modifier.height(8.dp))
                Text((if (done) "✓ " else num(i + 1) + " ") + t(ar, en), style = MaterialTheme.typography.labelSmall, maxLines = 1,
                    fontWeight = if (i == step) FontWeight.Bold else FontWeight.Normal,
                    color = if (i == step) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ---------- 1. date + addresses

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DetailsStep(
    pickup: AddressState, dropoff: AddressState, saved: List<SavedAddress>,
    dateFrom: String?, setFrom: (String?) -> Unit, dateTo: String?, setTo: (String?) -> Unit,
    time: String?, setTime: (String?) -> Unit, notes: String, setNotes: (String) -> Unit,
) {
    var pickDate by remember { mutableStateOf(false) }
    var pickTime by remember { mutableStateOf(false) }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { StepHeader(t("متى ووين؟", "When and where?"), t("حدّد يوم النقل وعنوان الاستلام والتسليم.", "Set the moving day and the pickup and delivery addresses.")) }
        item {
            SectionCard(title = t("موعد النقل", "Moving date"), icon = Icons.Outlined.CalendarMonth) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton({ pickDate = true }, Modifier.weight(1f).heightIn(min = 52.dp), contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)) {
                        Icon(Icons.Outlined.Event, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
                        Text(if (dateFrom == null) t("اختر التاريخ", "Pick a date") else dateText(dateFrom), maxLines = 2, textAlign = TextAlign.Center)
                    }
                    OutlinedButton({ pickTime = true }, Modifier.weight(0.8f).heightIn(min = 52.dp), contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)) {
                        Icon(Icons.Outlined.Schedule, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
                        Text(time?.let { time12(it) } ?: t("الوقت", "Time"), maxLines = 2, textAlign = TextAlign.Center)
                    }
                }
            }
        }
        item { AddressEditor(t("من (الاستلام)", "From (pickup)"), pickup, saved) }
        item { AddressEditor(t("إلى (التسليم)", "To (delivery)"), dropoff, saved) }
        item {
            OutlinedTextField(notes, { setNotes(it.take(2000)) }, Modifier.fillMaxWidth(), label = { Text(t("ملاحظات للفريق (اختياري)", "Notes for the crew (optional)")) }, minLines = 2)
        }
    }
    if (pickDate) {
        val today = LocalDate.now()
        val state = rememberDatePickerState(
            initialSelectedDateMillis = dateFrom?.let { LocalDate.parse(it).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli() },
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean =
                    !Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate().isBefore(today)
            },
        )
        DatePickerDialog(onDismissRequest = { pickDate = false }, confirmButton = {
            TextButton({
                state.selectedDateMillis?.let { ms ->
                    val d = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate().toString()
                    setFrom(d); setTo(null)
                }
                pickDate = false
            }) { Text(t("تم", "Done")) }
        }, dismissButton = { TextButton({ pickDate = false }) { Text(t("إلغاء", "Cancel")) } }) { DatePicker(state) }
    }
    if (pickTime) {
        // 12-hour clock with AM / PM
        val st = rememberTimePickerState(initialHour = time?.take(2)?.toIntOrNull() ?: 9, initialMinute = time?.drop(3)?.toIntOrNull() ?: 0, is24Hour = false)
        AlertDialog(onDismissRequest = { pickTime = false },
            confirmButton = { TextButton({ setTime("%02d:%02d".format(java.util.Locale.US, st.hour, st.minute)); pickTime = false }) { Text(t("تم", "Done")) } },
            dismissButton = { TextButton({ setTime(null); pickTime = false }) { Text(t("بدون وقت", "No time")) } },
            text = { TimePicker(st) })
    }
}

// ---------- 2. rooms + their photos (camera in the step), then the AI scan

@Composable
private fun PhotosStep(move: MoveDetail?, scanning: Boolean, setUploading: (Boolean) -> Unit, onChanged: () -> Unit, onError: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // rooms added in this session that have no photo yet (rooms with photos come from the server)
    var pending by rememberSaveable { mutableStateOf(listOf<String>()) }
    var target by rememberSaveable { mutableStateOf<String?>(null) } // the room the camera / gallery is for
    var uploadingRoom by remember { mutableStateOf<String?>(null) }
    var adding by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf<String?>(null) }
    val moveId = move?.id

    fun upload(room: String, uris: List<Uri>) {
        val id = moveId ?: return
        if (uris.isEmpty()) return
        uploadingRoom = room; setUploading(true)
        scope.launch {
            try {
                val jpegs = uris.map { compressPhoto(context, it) }
                jpegs.chunked(10).forEach { Api.uploadPhotos(id, room, it) }
                pending = pending - room
                onChanged()
            } catch (e: Exception) { onError(errorText(e)) } finally { uploadingRoom = null; setUploading(false) }
        }
    }
    // the launchers are registered on every composition (before any early return), so a result that arrives after
    // Android closed the app in the background still reaches us
    val camera = rememberCamera(onPhoto = { uri -> target?.let { upload(it, listOf(uri)) } }, onError = onError)
    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { uris -> target?.let { upload(it, uris) } }
    fun takePhoto(room: String) { target = room; camera("room") }
    fun pickPhotos(room: String) { target = room; gallery.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
    val m = move ?: return

    if (scanning) {
        Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            ScanAnimation()
            Spacer(Modifier.height(16.dp))
            Text(t("نفتح الصناديق ونتفقد أغراضك…", "Opening the boxes and checking your things…"), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
            Text(t("يتعرف الذكاء الاصطناعي على الأثاث في كل غرفة. قد يستغرق دقيقة.", "AI is recognising the furniture in each room. This can take a minute."),
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        }
        return
    }

    val byRoom = m.photos.groupBy { it.room }
    val rooms = (byRoom.keys.sortedBy { r -> byRoom[r]!!.minOf { it.created_at ?: "" } } + pending.filter { it !in byRoom }).distinct()

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            StepHeader(t("صوّر غرفك", "Photograph your rooms"),
                t("أضف كل غرفة فيها أغراض للنقل، وصوّرها من أكثر من زاوية. نحذف بيانات الموقع من الصور.",
                    "Add each room with things to move and photograph it from a few angles. We remove location data from the photos."))
        }
        if (rooms.isEmpty()) item { EmptyState(t("لا توجد غرف بعد", "No rooms yet"), t("ابدأ بإضافة غرفة.", "Start by adding a room."), Icons.Outlined.MeetingRoom) }
        items(rooms, key = { it }) { r ->
            val photos = byRoom[r].orEmpty()
            val scanned = photos.isNotEmpty() && photos.all { it.scanned }
            SectionCard(title = roomName(r), icon = Icons.Outlined.MeetingRoom, action = {
                IconButton({ if (photos.isEmpty()) pending = pending - r else removing = r }) { Icon(Icons.Outlined.DeleteOutline, t("حذف الغرفة", "Remove room"), tint = MaterialTheme.colorScheme.error) }
            }) {
                Text(
                    when {
                        photos.isEmpty() -> t("لا صور بعد", "No photos yet")
                        scanned -> t("${photos.size} صور · تم المسح", "${photos.size} photos · scanned")
                        else -> t("${photos.size} صور · ${photos.count { !it.scanned }} جديدة لم تُمسح", "${photos.size} photos · ${photos.count { !it.scanned }} new, not scanned")
                    },
                    style = MaterialTheme.typography.bodySmall, color = if (scanned) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (photos.isNotEmpty()) LazyVerticalGrid(GridCells.Adaptive(96.dp), Modifier.heightIn(max = 420.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), userScrollEnabled = false) {
                    items(photos, key = { it.id }) { p ->
                        Box {
                            AsyncImage(Api.url(p.url), null, Modifier.aspectRatio(1f).clip(RoundedCornerShape(12.dp)), contentScale = ContentScale.Crop)
                            if (p.scanned) Surface(Modifier.align(Alignment.BottomStart).padding(4.dp), shape = RoundedCornerShape(50), color = Brand.Lime) {
                                Row(Modifier.padding(horizontal = 6.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Outlined.Check, null, Modifier.size(12.dp), tint = Brand.Navy)
                                    Text(t("ممسوحة", "Scanned"), style = MaterialTheme.typography.labelSmall, color = Brand.Navy)
                                }
                            }
                            IconButton({ scope.launch { runCatching { Api.deletePhoto(p.id); onChanged() }.onFailure { onError(errorText(it)) } } },
                                Modifier.align(Alignment.TopEnd)) {
                                Surface(Modifier.size(32.dp), shape = CircleShape, color = MaterialTheme.colorScheme.secondaryContainer) {
                                    Box(contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Close, t("حذف الصورة", "Delete photo"), Modifier.size(16.dp)) }
                                }
                            }
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PrimaryButton(t("التقاط صورة", "Take a photo"), { takePhoto(r) }, Modifier.weight(1f), busy = uploadingRoom == r, enabled = uploadingRoom == null, icon = Icons.Outlined.PhotoCamera)
                    OutlinedButton({ pickPhotos(r) }, Modifier.weight(1f).heightIn(min = 52.dp), enabled = uploadingRoom == null, shape = MaterialTheme.shapes.medium) {
                        Icon(Icons.Outlined.PhotoLibrary, null); Spacer(Modifier.width(6.dp)); Text(t("من المعرض", "Gallery"), maxLines = 1)
                    }
                }
            }
        }
        item {
            OutlinedButton({ adding = true }, Modifier.fillMaxWidth().heightIn(min = 56.dp), shape = MaterialTheme.shapes.medium,
                border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary)) {
                Icon(Icons.Outlined.Add, null); Spacer(Modifier.width(8.dp)); Text(t("أضف غرفة", "Add a room"), style = MaterialTheme.typography.titleMedium)
            }
        }
    }

    if (adding) AddRoomDialog(existing = rooms, onDismiss = { adding = false }) { name ->
        adding = false
        val slug = roomSlug(name)
        if (slug.isNotEmpty() && slug !in rooms) pending = pending + slug
    }
    removing?.let { r ->
        AlertDialog(onDismissRequest = { removing = null },
            title = { Text(t("حذف ${roomName(r)}؟", "Remove ${roomName(r)}?")) },
            text = { Text(t("تُحذف صور هذه الغرفة.", "This room's photos are deleted.")) },
            confirmButton = {
                TextButton({
                    removing = null
                    scope.launch {
                        runCatching { byRoom[r].orEmpty().forEach { Api.deletePhoto(it.id) }; pending = pending - r; onChanged() }.onFailure { onError(errorText(it)) }
                    }
                }) { Text(t("حذف", "Remove"), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton({ removing = null }) { Text(t("إلغاء", "Cancel")) } })
    }
}

/** pick a room template, name it (filled in, numbered if the name is taken) */
@Composable
private fun AddRoomDialog(existing: List<String>, onDismiss: () -> Unit, onAdd: (String) -> Unit) {
    var picked by remember { mutableStateOf<RoomTemplate?>(null) }
    var name by remember { mutableStateOf("") }
    fun defaultName(tp: RoomTemplate): String {
        val base = t(tp.ar, tp.en)
        if (roomSlug(base) !in existing) return base
        var n = 2
        while (roomSlug("$base $n") in existing) n++
        return "$base $n"
    }
    AlertDialog(onDismissRequest = onDismiss,
        icon = { Icon(Icons.Outlined.MeetingRoom, null) },
        title = { Text(t("أضف غرفة", "Add a room")) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(t("اختر نوع الغرفة", "Choose the type of room"), style = MaterialTheme.typography.bodyMedium)
                LazyVerticalGrid(GridCells.Fixed(3), Modifier.heightIn(max = 300.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(ROOM_TEMPLATES, key = { it.key }) { tp ->
                        val sel = picked == tp
                        Surface(
                            Modifier.clip(MaterialTheme.shapes.medium).selectable(selected = sel, role = Role.RadioButton) { picked = tp; name = defaultName(tp) },
                            shape = MaterialTheme.shapes.medium,
                            color = if (sel) Brand.Lime else MaterialTheme.colorScheme.surfaceVariant,
                            border = if (sel) BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary) else null,
                        ) {
                            Column(Modifier.padding(vertical = 10.dp, horizontal = 4.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(tp.icon, null, tint = if (sel) Brand.Navy else MaterialTheme.colorScheme.primary)
                                Text(t(tp.ar, tp.en), style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.Center, maxLines = 2,
                                    color = if (sel) Brand.Navy else MaterialTheme.colorScheme.onSurface)
                            }
                        }
                    }
                }
                OutlinedTextField(name, { name = it.take(30) }, Modifier.fillMaxWidth(), singleLine = true, enabled = picked != null,
                    label = { Text(t("اسم الغرفة", "Room name")) }, placeholder = { Text(t("مثال: غرفة نوم الأولاد", "e.g. Boys' bedroom")) },
                    isError = name.isNotBlank() && roomSlug(name) in existing,
                    supportingText = { if (name.isNotBlank() && roomSlug(name) in existing) Text(t("يوجد غرفة بهذا الاسم", "A room with this name exists")) })
            }
        },
        confirmButton = {
            TextButton({ onAdd(name.trim()) }, enabled = picked != null && roomSlug(name).isNotEmpty() && roomSlug(name) !in existing) { Text(t("إضافة", "Add")) }
        },
        dismissButton = { TextButton(onDismiss) { Text(t("إلغاء", "Cancel")) } })
}

// ---------- 3. items: check each on its photo (3x3 grid), rename, quantity, sell / move / donate

@Composable
private fun ItemsStep(move: MoveDetail?, onMove: (MoveDetail) -> Unit, onError: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var renaming by remember { mutableStateOf<com.nagla.app.data.Item?>(null) }
    var catalog by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<String?>(null) }
    var roomFilter by rememberSaveable { mutableStateOf<String?>(null) }
    val list = rememberLazyListState()
    val m = move ?: return
    fun patch(id: String, body: JsonObject) = scope.launch { runCatching { onMove(Api.patchItem(id, body)) }.onFailure { onError(errorText(it)) } }

    // every detected item gets a number, shown on its photo and on its card; its room is the room of that photo
    val detections = m.photos.flatMap { p -> p.detections.map { p to it } }
    val firstSighting = detections.filter { it.second.item_id != null }.groupBy { it.second.item_id!! }.mapValues { it.value.first() }
    val numbers = m.items.filter { it.id in firstSighting }.mapIndexed { i, it -> it.id to i + 1 }.toMap()
    val roomOf = firstSighting.mapValues { it.value.first.room }
    val rooms = m.items.mapNotNull { roomOf[it.id] }.distinct()
    val shown = m.items.filter { roomFilter == null || roomOf[it.id] == roomFilter }
    val reviewPhotos = m.photos.filter { p -> p.detections.any { it.item_id in numbers } && (roomFilter == null || p.room == roomFilter) }
    val headerCount = 3 + if (reviewPhotos.isNotEmpty()) 1 else 0

    LazyColumn(state = list, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(verticalAlignment = Alignment.Top) {
                Box(Modifier.weight(1f)) { StepHeader(t("أغراضك، على كيفك", "Your things, your way"), t("راجع الأسماء والكميات قبل المتابعة.", "Check the names and quantities before you continue.")) }
                IconButton({ catalog = true }) { Icon(Icons.Outlined.AddCircleOutline, t("إضافة قطعة", "Add item"), tint = MaterialTheme.colorScheme.primary) }
            }
        }
        item {
            InfoBanner(Icons.Outlined.DocumentScanner) {
                Text(t("راجع نتائج المسح. تُسعَّر قطع «نقل» فقط؛ البيع والتبرع لتنظيم القائمة.",
                    "Check the scan results. Only \"Move\" items are priced; Sell and Donate keep your list tidy."), style = MaterialTheme.typography.bodyMedium)
            }
        }
        // rooms: All · Living room · Bedroom …
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RoomChip(t("الكل", "All") + " · " + num(m.items.size), roomFilter == null) { roomFilter = null }
                rooms.forEach { r -> RoomChip(roomName(r) + " · " + num(m.items.count { roomOf[it.id] == r }), roomFilter == r) { roomFilter = r } }
            }
        }
        if (reviewPhotos.isNotEmpty()) item(key = "review") {
            PhotoReviewCard(reviewPhotos, numbers, selected) { id ->
                selected = id
                val idx = shown.indexOfFirst { it.id == id }
                if (idx >= 0) scope.launch { list.animateScrollToItem(headerCount + idx) }
            }
        }
        if (m.items.isEmpty()) item { EmptyState(t("لم نجد أغراضاً", "No items found"), t("أضفها من الكتالوج أو أضف صوراً أوضح.", "Add them from the catalog or add clearer photos.")) }
        itemsIndexed(shown, key = { _, it -> it.id }) { _, i ->
            val sighting = firstSighting[i.id]
            val isSel = selected == i.id
            SectionCard(
                Modifier.clip(MaterialTheme.shapes.large).clickable(onClickLabel = t("إظهار القطعة على الصورة", "Show the item on its photo")) {
                    selected = if (isSel) null else i.id
                    // show the item on its photo
                    if (!isSel && sighting != null && reviewPhotos.isNotEmpty()) scope.launch { list.animateScrollToItem(3) }
                }
                    .then(if (isSel) Modifier.background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.25f), MaterialTheme.shapes.large) else Modifier),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box {
                        if (sighting != null && sighting.second.box != null)
                            PhotoCrop(Api.url(sighting.first.url), sighting.first.width ?: 1200, sighting.first.height ?: 1600, sighting.second.box!!, 64)
                        else Box(Modifier.size(64.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.background), Alignment.Center) {
                            Icon(Icons.Outlined.Chair, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        numbers[i.id]?.let { NumberBadge(it, isSel, Modifier.align(Alignment.TopStart).offset((-4).dp, (-4).dp)) }
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(t(i.name_ar, i.name_en), style = MaterialTheme.typography.titleMedium)
                        Text(
                            listOfNotNull(
                                if (i.source == "ai") t("اكتشاف ذكي", "AI detected") else t("مضاف يدوياً", "Added"),
                                roomOf[i.id]?.let { roomName(it) },
                                if (i.fragile) t("قابل للكسر", "fragile") else null,
                            ).joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton({ renaming = i }) { Icon(Icons.Outlined.Edit, t("تعديل", "Edit")) }
                    IconButton({ scope.launch { runCatching { onMove(Api.deleteItem(i.id)) }.onFailure { onError(errorText(it)) } } }) {
                        Icon(Icons.Outlined.DeleteOutline, t("حذف", "Delete"), tint = MaterialTheme.colorScheme.error)
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(t("الكمية", "Quantity"), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    QuantityStepper(i.quantity,
                        onMinus = { if (i.quantity > 1) patch(i.id, Api.obj("quantity" to i.quantity - 1)) },
                        onPlus = { if (i.quantity < 500) patch(i.id, Api.obj("quantity" to i.quantity + 1)) })
                }
                DecisionSlider(i.disposition, { d -> patch(i.id, Api.obj("disposition" to d)) })
            }
        }
    }

    renaming?.let { i ->
        var name by remember(i.id) { mutableStateOf(i.custom_name ?: t(i.name_ar, i.name_en)) }
        AlertDialog(onDismissRequest = { renaming = null },
            title = { Text(t("تسمية القطعة", "Name this item")) },
            text = {
                Column {
                    OutlinedTextField(name, { name = it.take(100) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Text(t("الاسم في الكتالوج: ", "Catalog name: ") + t(i.catalog_name_ar ?: i.name_ar, i.catalog_name_en ?: i.name_en),
                        style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp))
                }
            },
            confirmButton = { TextButton({ patch(i.id, Api.obj("name" to name.trim())); renaming = null }) { Text(t("حفظ", "Save")) } },
            dismissButton = {
                Row {
                    if (i.custom_name != null) TextButton({ patch(i.id, Api.obj("name" to null)); renaming = null }) { Text(t("الاسم الأصلي", "Original name")) }
                    TextButton({ renaming = null }) { Text(t("إلغاء", "Cancel")) }
                }
            })
    }
    if (catalog) CatalogSheet(onDismiss = { catalog = false }) { row ->
        catalog = false
        scope.launch { runCatching { Api.addItem(m.id, row.id); onMove(Api.move(m.id)) }.onFailure { onError(errorText(it)) } }
    }
}

@Composable
private fun RoomChip(label: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(selected, onClick, { Text(label) }, shape = RoundedCornerShape(50),
        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Brand.Navy, selectedLabelColor = androidx.compose.ui.graphics.Color.White),
        border = FilterChipDefaults.filterChipBorder(enabled = true, selected = selected, borderColor = MaterialTheme.colorScheme.outlineVariant))
}

@Composable
fun NumberBadge(n: Int, selected: Boolean, modifier: Modifier = Modifier) {
    Box(modifier.size(22.dp).clip(CircleShape).background(if (selected) Brand.Lime else Brand.TealDark), Alignment.Center) {
        Text("$n", style = MaterialTheme.typography.labelSmall, color = if (selected) Brand.Navy else androidx.compose.ui.graphics.Color.White, fontWeight = FontWeight.Bold)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CatalogSheet(onDismiss: () -> Unit, onPick: (CatalogRow) -> Unit) {
    var q by remember { mutableStateOf("") }
    val loader = rememberLoader(q) { if (q.length == 1) emptyList() else Api.catalog(q).filter { it.category != "other" || q.isNotBlank() }.take(50) }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(horizontal = 16.dp).fillMaxHeight(0.8f)) {
            OutlinedTextField(q, { q = it }, Modifier.fillMaxWidth(), singleLine = true, leadingIcon = { Icon(Icons.Outlined.Search, null) },
                placeholder = { Text(t("ابحث: كنبة، سرير، ثلاجة…", "Search: sofa, bed, fridge…")) })
            LazyColumn {
                items(loader.data.orEmpty(), key = { it.id }) { r ->
                    ListItem(
                        headlineContent = { Text(t(r.name_ar, r.name_en)) },
                        supportingContent = { Text(r.variant + " · %.2f m³".format(r.volume_m3)) },
                        trailingContent = { Icon(Icons.Outlined.AddCircleOutline, t("إضافة", "Add"), tint = MaterialTheme.colorScheme.primary) },
                        modifier = Modifier.clickable { onPick(r) },
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}

// ---------- 4. offers: pick a company (cheapest first, preselected), confirm from the bottom bar

@Composable
private fun OffersStep(moveId: String, move: MoveDetail?, chosen: Offer?, onChoose: (Offer) -> Unit) {
    val loader = rememberLoader(moveId) { Api.quotes(moveId) }
    val offers = loader.data?.offers.orEmpty()
    LaunchedEffect(offers) { if (offers.isNotEmpty() && offers.none { it.company_id == chosen?.company_id }) onChoose(offers.first()) }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            StepHeader(t("اختر فريق نقلتك", "Choose your moving team"),
                if (offers.isEmpty()) t("عروض لنفس قائمة الأغراض.", "Offers for the same item list.")
                else t("${num(offers.size)} عروض لنفس قائمة الأغراض.", "${offers.size} offers for the same item list."))
        }
        loader.error?.let { item { ErrorNote(it) } }
        if (loader.loading) item { Box(Modifier.fillMaxWidth().padding(32.dp), Alignment.Center) { CircularProgressIndicator() } }
        loader.data?.let { d ->
            item {
                val keep = move?.items?.filter { it.disposition == "keep" }?.sumOf { it.quantity } ?: 0
                InfoBanner(Icons.Outlined.Inventory2) {
                    Text(t("${num(keep)} قطع للنقل", "$keep items to move") + (move?.pickup_details?.city?.let { " · $it" } ?: ""), style = MaterialTheme.typography.titleSmall)
                    Text(dayMonthText(move?.date_from) + (d.volume_m3?.let { " · " + "%.1f m³".format(it) } ?: ""), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        if (offers.any { it.trips > 1 }) t("لا توجد شاحنة تكفي في رحلة واحدة، فهذه أقل الرحلات.", "No truck carries it in one trip, so these need the fewest trips.")
                        else t("نعرض الشركات التي لديها شاحنة تكفي هذا الحجم في رحلة واحدة.", "Only companies with a truck that carries this volume in one trip are shown."),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        if (loader.data != null && offers.isEmpty()) item { EmptyState(t("لا توجد عروض", "No offers"), t("حدد قطعة واحدة على الأقل للنقل.", "Mark at least one item as Move.")) }
        items(offers, key = { it.company_id }) { o -> OfferCard(o, o.company_id == chosen?.company_id) { onChoose(o) } }
        if (offers.isNotEmpty()) item {
            Text(t("المدة تقديرية لتنفيذ النقل، وليست موعد وصول.", "The time is an estimate of the job, not an arrival time."),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun OfferCard(o: Offer, selected: Boolean, onClick: () -> Unit) {
    Card(
        Modifier.fillMaxWidth().clip(MaterialTheme.shapes.large).clickable(onClick = onClick), shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) Brand.TealDark else MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (selected) Box(Modifier.size(24.dp).clip(CircleShape).background(Brand.TealDark), Alignment.Center) {
                    Icon(Icons.Outlined.Check, null, Modifier.size(16.dp), tint = androidx.compose.ui.graphics.Color.White)
                } else Box(Modifier.size(24.dp).clip(CircleShape).border(2.dp, MaterialTheme.colorScheme.outline, CircleShape))
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(o.company_name, style = MaterialTheme.typography.titleLarge)
                    val sub = listOfNotNull(o.company_city, o.google_rating?.let { "★ %.1f".format(it) + t(" على Google", " on Google") }).joinToString(" · ")
                    if (sub.isNotBlank()) Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (selected) Surface(color = MaterialTheme.colorScheme.background, shape = RoundedCornerShape(8.dp)) {
                    Text(t("اختيارك", "Your pick"), Modifier.padding(horizontal = 10.dp, vertical = 4.dp), style = MaterialTheme.typography.labelMedium, color = Brand.TealDark)
                }
            }
            Row(verticalAlignment = Alignment.Bottom) {
                Text(sar(o.price_halalas), style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
                Text(t("إجمالي العرض", "Total"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Row {
                FactCell(Icons.Outlined.LocalShipping, t("سعة الشاحنة", "Truck size"), "%.0f m³".format(o.truck_capacity_m3), Modifier.weight(1f))
                FactCell(Icons.Outlined.Sync, t("الرحلات", "Trips"), tripsText(o.trips), Modifier.weight(1f))
            }
            Row {
                FactCell(Icons.Outlined.Groups, t("الفريق", "Crew"), t("${num(o.crew_size)} عمّال", "${o.crew_size} movers"), Modifier.weight(1f))
                FactCell(Icons.Outlined.Schedule, t("المدة التقديرية", "Estimated time"), t("${num(o.estimated_minutes)} دقيقة", "${o.estimated_minutes} min"), Modifier.weight(1f))
            }
        }
    }
}
