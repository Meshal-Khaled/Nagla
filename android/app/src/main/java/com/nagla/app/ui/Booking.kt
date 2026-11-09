package com.nagla.app.ui

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.foundation.clickable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
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
    "الموعد والعناوين" to "Date & addresses",
    "الصور والمسح" to "Photos & scan",
    "الأغراض" to "Items",
    "الأسعار" to "Prices",
)

/**
 * New move, in four steps: 1 date + addresses (location, search, map), 2 photos (camera / gallery)
 * with the AI scan running on Continue, 3 items (rename, quantity, sell/move/donate slider), 4 prices.
 * The move exists on the server from step 2; leaving asks to save the draft or discard it.
 */
@Composable
fun BookingScreen(nav: NavHostController, startId: String?) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var moveId by rememberSaveable { mutableStateOf(startId) }
    var move by remember { mutableStateOf<MoveDetail?>(null) }
    var step by rememberSaveable { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var askLeave by remember { mutableStateOf(false) }
    var scanning by remember { mutableStateOf(false) }
    var photosChanged by rememberSaveable { mutableStateOf(false) }
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
            photosChanged = m.items.isEmpty() && m.photos.isNotEmpty()
        }.onFailure { error = errorText(it) }
    }

    fun leave() {
        val m = move
        if (m != null && !m.draft_saved) askLeave = true else nav.popBackStack()
    }
    BackHandler { if (step > 0 && !scanning) step-- else leave() }

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

    // step 2 → run the AI scan automatically (only when the photos changed since the last scan)
    fun scanAndContinue() {
        val id = moveId ?: return
        if (!photosChanged && (move?.items?.isNotEmpty() == true)) { step = 2; return }
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
                refresh(); photosChanged = false; step = 2
            } catch (e: Exception) {
                error = t("تعذر المسح: ", "Scan failed: ") + errorText(e)
            } finally { scanning = false }
        }
    }

    AppScreen(t("طلب نقل جديد", "New move"), onBack = { if (step > 0) step-- else leave() }, actions = {
        if (moveId != null && move?.draft_saved != true) TextButton({ run { Api.saveDraft(moveId!!); refresh() } }) { Text(t("حفظ كمسودة", "Save draft")) }
        else if (move?.draft_saved == true) Icon(Icons.Outlined.CloudDone, t("محفوظة", "Saved"), Modifier.padding(end = 12.dp), tint = MaterialTheme.colorScheme.primary)
    }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            Stepper(step) { i -> if (i < step && !scanning) step = i }
            ErrorNote(error?.let { it })
            Box(Modifier.weight(1f)) {
                AnimatedContent(step, label = "step") { s ->
                    when (s) {
                        0 -> DetailsStep(pickup, dropoff, saved, dateFrom, { dateFrom = it }, dateTo, { dateTo = it }, time, { time = it }, notes, { notes = it }, busy) { saveDetails() }
                        1 -> PhotosStep(move, busy, scanning, onChanged = { photosChanged = true; scope.launch { runCatching { refresh() } } }, onError = { error = it }) { scanAndContinue() }
                        2 -> ItemsStep(move, onMove = { move = it }, onError = { error = it }) { step = 3 }
                        else -> OffersStep(moveId!!, onError = { error = it }) { companyId -> run {
                            Api.confirm(moveId!!, companyId)
                            nav.navigate("move/$moveId") { popUpTo("home") }
                        } }
                    }
                }
            }
        }
    }

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
}

@Composable
private fun Stepper(step: Int, onPick: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        STEPS.forEachIndexed { i, (ar, en) ->
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(3.dp)).then(
                    Modifier.padding(0.dp)), contentAlignment = Alignment.Center) {
                    Surface(Modifier.fillMaxSize(), color = if (i <= step) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant) {}
                }
                TextButton({ onPick(i) }, contentPadding = PaddingValues(2.dp)) {
                    Text(t(ar, en), style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center, maxLines = 2,
                        fontWeight = if (i == step) FontWeight.Bold else FontWeight.Normal,
                        color = if (i == step) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                }
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
    time: String?, setTime: (String?) -> Unit, notes: String, setNotes: (String) -> Unit, busy: Boolean, onNext: () -> Unit,
) {
    var pickDate by remember { mutableStateOf<String?>(null) } // "from" | "to"
    var pickTime by remember { mutableStateOf(false) }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            SectionCard(title = t("موعد النقل", "Moving date"), icon = Icons.Outlined.CalendarMonth) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton({ pickDate = "from" }, Modifier.weight(1f)) { Text(if (dateFrom == null) t("اختر التاريخ", "Pick a date") else dateText(dateFrom)) }
                    OutlinedButton({ pickTime = true }, Modifier.weight(0.7f)) { Icon(Icons.Outlined.Schedule, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text(time ?: t("الوقت", "Time")) }
                }
                TextButton({ pickDate = "to" }) { Text(if (dateTo != null && dateTo != dateFrom) t("مرن حتى ", "Flexible until ") + dateText(dateTo) else t("موعدي مرن؟ أضف تاريخاً أخيراً", "Flexible? Add a latest date")) }
            }
        }
        item { AddressEditor(t("من (الاستلام)", "From (pickup)"), pickup, saved) }
        item { AddressEditor(t("إلى (التسليم)", "To (delivery)"), dropoff, saved) }
        item {
            OutlinedTextField(notes, { setNotes(it.take(2000)) }, Modifier.fillMaxWidth(), label = { Text(t("ملاحظات للفريق (اختياري)", "Notes for the crew (optional)")) }, minLines = 2)
        }
        item {
            PrimaryButton(t("التالي: الصور", "Next: photos"), onNext, Modifier.fillMaxWidth(),
                enabled = dateFrom != null && pickup.complete && dropoff.complete, busy = busy, icon = Icons.Outlined.PhotoCamera)
            if (dateFrom == null || !pickup.complete || !dropoff.complete) Text(t("أكمل التاريخ والعنوانين للمتابعة.", "Add the date and both addresses to continue."),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
        }
    }
    pickDate?.let { which ->
        val today = LocalDate.now()
        val state = rememberDatePickerState(
            initialSelectedDateMillis = (if (which == "from") dateFrom else dateTo ?: dateFrom)?.let { LocalDate.parse(it).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli() },
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean {
                    val d = Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate()
                    return !d.isBefore(if (which == "to" && dateFrom != null) LocalDate.parse(dateFrom) else today)
                }
            },
        )
        DatePickerDialog(onDismissRequest = { pickDate = null }, confirmButton = {
            TextButton({
                state.selectedDateMillis?.let { ms ->
                    val d = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate().toString()
                    if (which == "from") { setFrom(d); if (dateTo != null && dateTo < d) setTo(null) } else setTo(d)
                }
                pickDate = null
            }) { Text(t("تم", "Done")) }
        }, dismissButton = { TextButton({ pickDate = null }) { Text(t("إلغاء", "Cancel")) } }) { DatePicker(state) }
    }
    if (pickTime) {
        val st = rememberTimePickerState(initialHour = time?.take(2)?.toIntOrNull() ?: 9, initialMinute = time?.drop(3)?.toIntOrNull() ?: 0)
        AlertDialog(onDismissRequest = { pickTime = false },
            confirmButton = { TextButton({ setTime("%02d:%02d".format(st.hour, st.minute)); pickTime = false }) { Text(t("تم", "Done")) } },
            dismissButton = { TextButton({ setTime(null); pickTime = false }) { Text(t("بدون وقت", "No time")) } },
            text = { TimePicker(st) })
    }
}

// ---------- 2. photos (camera in the step) + automatic AI scan

@Composable
private fun PhotosStep(move: MoveDetail?, busy: Boolean, scanning: Boolean, onChanged: () -> Unit, onError: (String) -> Unit, onNext: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var room by rememberSaveable { mutableStateOf("living_room") }
    var uploading by remember { mutableStateOf(false) }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    val m = move ?: return

    fun upload(uris: List<Uri>) {
        if (uris.isEmpty()) return
        uploading = true
        scope.launch {
            try {
                val jpegs = uris.map { compressPhoto(context, it) }
                jpegs.chunked(10).forEach { Api.uploadPhotos(m.id, room, it) }
                onChanged()
            } catch (e: Exception) { onError(errorText(e)) } finally { uploading = false }
        }
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) cameraUri?.let { upload(listOf(it)) } }
    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { upload(it) }
    fun takePhoto() {
        val dir = File(context.cacheDir, "camera").apply { mkdirs() }
        val file = File(dir, "room-${System.currentTimeMillis()}.jpg")
        cameraUri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
        camera.launch(cameraUri!!)
    }

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

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            SectionCard(title = t("صوّر كل غرفة", "Photograph each room"), icon = Icons.Outlined.PhotoCamera) {
                Text(t("التقط صوراً من أكثر من زاوية. نحذف بيانات الموقع من الصور.", "Take a few photos from different angles. We remove location data from them."),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ROOMS.forEach { (k, _) -> FilterChip(room == k, { room = k }, { Text(roomName(k)) }) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PrimaryButton(t("التقاط صورة", "Take a photo"), ::takePhoto, Modifier.weight(1f), busy = uploading, icon = Icons.Outlined.PhotoCamera)
                    OutlinedButton({ gallery.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, Modifier.weight(1f).heightIn(min = 52.dp), enabled = !uploading) {
                        Icon(Icons.Outlined.PhotoLibrary, null); Spacer(Modifier.width(6.dp)); Text(t("من المعرض", "Gallery"))
                    }
                }
            }
        }
        val byRoom = m.photos.groupBy { it.room }
        if (byRoom.isEmpty()) item { EmptyState(t("لا توجد صور بعد", "No photos yet"), t("ابدأ بغرفة المعيشة.", "Start with the living room."), Icons.Outlined.PhotoCamera) }
        byRoom.forEach { (r, photos) ->
            item(key = r) {
                SectionCard(title = roomName(r) + " · ${photos.size}") {
                    LazyVerticalGrid(GridCells.Adaptive(96.dp), Modifier.heightIn(max = 420.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), userScrollEnabled = false) {
                        items(photos, key = { it.id }) { p ->
                            Box {
                                AsyncImage(Api.url(p.url), null, Modifier.aspectRatio(1f).clip(RoundedCornerShape(12.dp)), contentScale = ContentScale.Crop)
                                FilledTonalIconButton({ scope.launch { runCatching { Api.deletePhoto(p.id); onChanged() }.onFailure { onError(errorText(it)) } } },
                                    Modifier.align(Alignment.TopEnd).padding(4.dp).size(30.dp)) { Icon(Icons.Outlined.Close, t("حذف", "Delete"), Modifier.size(16.dp)) }
                            }
                        }
                    }
                }
            }
        }
        item {
            PrimaryButton(t("التالي: المسح الذكي", "Next: AI scan"), onNext, Modifier.fillMaxWidth(), enabled = m.photos.isNotEmpty() && !uploading, busy = busy, icon = Icons.Outlined.AutoAwesome)
        }
    }
}

// ---------- 3. items: rename, quantity, sell / move / donate

@Composable
private fun ItemsStep(move: MoveDetail?, onMove: (MoveDetail) -> Unit, onError: (String) -> Unit, onNext: () -> Unit) {
    val scope = rememberCoroutineScope()
    var renaming by remember { mutableStateOf<com.nagla.app.data.Item?>(null) }
    var catalog by remember { mutableStateOf(false) }
    val m = move ?: return
    fun patch(id: String, body: JsonObject) = scope.launch { runCatching { onMove(Api.patchItem(id, body)) }.onFailure { onError(errorText(it)) } }

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(t("${m.items.size} قطعة", "${m.items.size} items"), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                OutlinedButton({ catalog = true }) { Icon(Icons.Outlined.Add, null); Spacer(Modifier.width(4.dp)); Text(t("إضافة قطعة", "Add item")) }
            }
            Text(t("اسحب صندوق كل قطعة: بيع، نقل، أو تبرع. القطع المحددة \"نقل\" فقط تدخل في السعر.",
                "Slide each item's box: Sell, Move or Donate. Only items marked Move count towards the price."),
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (m.items.isEmpty()) item { EmptyState(t("لم نجد أغراضاً", "No items found"), t("أضفها من الكتالوج أو أضف صوراً أوضح.", "Add them from the catalog or add clearer photos.")) }
        items(m.items, key = { it.id }) { i ->
            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(t(i.name_ar, i.name_en), style = MaterialTheme.typography.titleMedium)
                        Text(
                            listOfNotNull(
                                if (i.source == "ai") t("اكتشاف ذكي", "AI detected") else t("مضاف يدوياً", "Added"),
                                if (i.custom_name != null) t(i.catalog_name_ar ?: "", i.catalog_name_en ?: "") else null,
                                "%.2f m³".format(i.volume_m3), if (i.fragile) t("قابل للكسر", "fragile") else null,
                            ).filter { it.isNotBlank() }.joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton({ renaming = i }) { Icon(Icons.Outlined.Edit, t("إعادة تسمية", "Rename")) }
                    IconButton({ scope.launch { runCatching { onMove(Api.deleteItem(i.id)) }.onFailure { onError(errorText(it)) } } }) {
                        Icon(Icons.Outlined.DeleteOutline, t("حذف", "Delete"), tint = MaterialTheme.colorScheme.error)
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(t("الكمية", "Quantity"), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    FilledTonalIconButton({ if (i.quantity > 1) patch(i.id, Api.obj("quantity" to i.quantity - 1)) }, enabled = i.quantity > 1) { Icon(Icons.Outlined.Remove, "−") }
                    Text("${i.quantity}", Modifier.padding(horizontal = 14.dp), style = MaterialTheme.typography.titleMedium)
                    FilledTonalIconButton({ if (i.quantity < 500) patch(i.id, Api.obj("quantity" to i.quantity + 1)) }) { Icon(Icons.Outlined.Add, "+") }
                }
                DecisionSlider(i.disposition, { d -> patch(i.id, Api.obj("disposition" to d)) })
            }
        }
        item { PrimaryButton(t("التالي: الأسعار", "Next: prices"), onNext, Modifier.fillMaxWidth(), enabled = m.items.any { it.disposition == "keep" }, icon = Icons.Outlined.Payments) }
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

// ---------- 4. prices

@Composable
private fun OffersStep(moveId: String, onError: (String) -> Unit, onConfirm: (String) -> Unit) {
    val loader = rememberLoader(moveId) { Api.quotes(moveId) }
    var pick by remember { mutableStateOf<Offer?>(null) }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        loader.error?.let { item { ErrorNote(it) } }
        val offers = loader.data?.offers.orEmpty()
        if (loader.data != null && offers.isEmpty()) item { EmptyState(t("لا توجد أسعار", "No prices"), t("حدد قطعة واحدة على الأقل للنقل.", "Mark at least one item as Move.")) }
        items(offers, key = { it.company_id }) { o ->
            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(o.company_name, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                    if (o == offers.first()) Surface(color = Brand.Lime, shape = RoundedCornerShape(50)) { Text(t("الأقل سعراً", "Lowest price"), Modifier.padding(horizontal = 10.dp, vertical = 3.dp), color = Brand.Navy, style = MaterialTheme.typography.labelMedium) }
                }
                Text(sar(o.price_halalas), style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
                InfoRow(t("الشاحنة", "Truck"), "${o.truck_name} (${o.truck_capacity_m3} m³) × ${o.trips}", Icons.Outlined.LocalShipping)
                InfoRow(t("العمال", "Crew"), o.crew_size.toString(), Icons.Outlined.Groups)
                InfoRow(t("المدة", "Time"), "~${o.estimated_minutes} " + t("دقيقة", "min"), Icons.Outlined.Schedule)
                PrimaryButton(t("تأكيد مع ", "Confirm with ") + o.company_name, { pick = o }, Modifier.fillMaxWidth())
            }
        }
    }
    pick?.let { o ->
        AlertDialog(onDismissRequest = { pick = null },
            title = { Text(t("تأكيد الطلب؟", "Confirm your move?")) },
            text = { Text(t("سيُرسل طلبك إلى ${o.company_name} ويُثبّت السعر ${sar(o.price_halalas)}. بعدها لا يمكن تعديل الأغراض.",
                "Your move goes to ${o.company_name} and the price ${sar(o.price_halalas)} is locked. Items can't be edited after this.")) },
            confirmButton = { TextButton({ pick = null; onConfirm(o.company_id) }) { Text(t("تأكيد", "Confirm")) } },
            dismissButton = { TextButton({ pick = null }) { Text(t("رجوع", "Back")) } })
    }
}
