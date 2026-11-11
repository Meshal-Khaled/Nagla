package com.nagla.app.ui

import android.view.ViewTreeObserver
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.location.Geocoder
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.nagla.app.data.AddressDetails
import com.nagla.app.data.Api
import com.nagla.app.data.GeoAddress
import com.nagla.app.data.Prefs
import com.nagla.app.data.SavedAddress
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMapOptions
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import java.util.Locale

/** one address being edited: the free text plus the structured parts the map fills in */
class AddressState {
    var address by mutableStateOf("")
    var lat by mutableStateOf<Double?>(null)
    var lng by mutableStateOf<Double?>(null)
    var floor by mutableStateOf("0")
    var elevator by mutableStateOf(false)
    var district by mutableStateOf("")
    var street by mutableStateOf("")
    var building by mutableStateOf("")
    var postal by mutableStateOf("")
    var shortCode by mutableStateOf("")
    var city by mutableStateOf("")

    val complete get() = address.isNotBlank()

    fun fill(g: GeoAddress) {
        lat = g.lat; lng = g.lng
        address = g.display_name.ifBlank { listOfNotNull(g.place_name, g.district, g.city).joinToString("، ") }
        g.district?.let { district = it }
        g.street?.let { street = it }
        g.postal_code?.let { postal = it }
        g.short_code?.let { shortCode = it }
        g.city?.let { city = it }
    }

    fun fillSaved(a: SavedAddress) {
        address = a.address; lat = a.lat; lng = a.lng
        floor = (a.floor ?: 0).toString(); elevator = a.has_elevator == true
        a.details?.let { d -> district = d.district ?: ""; street = d.street ?: ""; building = d.building_number ?: ""; postal = d.postal_code ?: ""; shortCode = d.short_code ?: ""; city = d.city ?: "" }
    }

    fun details() = AddressDetails(
        district = district.ifBlank { null }, street = street.ifBlank { null }, building_number = building.ifBlank { null },
        postal_code = postal.ifBlank { null }, short_code = shortCode.ifBlank { null }, city = city.ifBlank { null },
    )

    fun load(address: String?, lat: Double?, lng: Double?, floor: Int?, elevator: Boolean?, d: AddressDetails?) {
        this.address = address ?: ""; this.lat = lat; this.lng = lng
        this.floor = (floor ?: 0).toString(); this.elevator = elevator == true
        district = d?.district ?: ""; street = d?.street ?: ""; building = d?.building_number ?: ""
        postal = d?.postal_code ?: ""; shortCode = d?.short_code ?: ""; city = d?.city ?: ""
    }
}

/** Hudhud through the API when it is configured, else the phone's own geocoder */
object Geo {
    private var provider: String? = null
    var mapStyleUrl: String? = null
        private set

    private suspend fun hudhud(): Boolean {
        if (provider == null) runCatching { Api.geoConfig() }.onSuccess { provider = it.provider; mapStyleUrl = it.map_style_url }
        return provider == "hudhud"
    }

    suspend fun reverse(context: Context, lat: Double, lng: Double): GeoAddress =
        if (hudhud()) Api.geoReverse(lat, lng) else withContext(Dispatchers.IO) {
            @Suppress("DEPRECATION")
            val a = Geocoder(context, if (Prefs.lang == "ar") Locale("ar") else Locale.ENGLISH).getFromLocation(lat, lng, 1)?.firstOrNull()
            GeoAddress(
                display_name = a?.getAddressLine(0) ?: "$lat, $lng", place_name = a?.featureName, lat = lat, lng = lng,
                street = a?.thoroughfare, district = a?.subLocality, city = a?.locality, province = a?.adminArea, postal_code = a?.postalCode,
            )
        }

    suspend fun search(context: Context, q: String): List<GeoAddress> =
        if (hudhud()) Api.geoSearch(q) else withContext(Dispatchers.IO) {
            @Suppress("DEPRECATION")
            Geocoder(context, if (Prefs.lang == "ar") Locale("ar") else Locale.ENGLISH).getFromLocationName("$q, Saudi Arabia", 6).orEmpty().map { a ->
                GeoAddress(display_name = a.getAddressLine(0) ?: q, place_name = a.featureName, lat = a.latitude, lng = a.longitude,
                    street = a.thoroughfare, district = a.subLocality, city = a.locality, province = a.adminArea, postal_code = a.postalCode)
            }
        }

    // OpenFreeMap (free OpenStreetMap vector tiles, no key, made for apps) until the Hudhud style is configured.
    // tile.openstreetmap.org is not for apps: it answers map libraries with blank tiles.
    const val FREE_STYLE = "https://tiles.openfreemap.org/styles/liberty"

    /** place names in the app's language (the free style shows Latin and Arabic together) */
    fun localiseLabels(style: Style) {
        val name = if (Prefs.lang == "ar")
            Expression.coalesce(Expression.get("name:ar"), Expression.get("name"), Expression.get("name:latin"))
        else Expression.coalesce(Expression.get("name:en"), Expression.get("name_en"), Expression.get("name:latin"), Expression.get("name"))
        style.layers.filterIsInstance<SymbolLayer>().forEach { layer ->
            // road shields show the road number ("ref"): leave those alone
            if (layer.textField.expression?.toString()?.contains("name") == true) layer.setProperties(PropertyFactory.textField(name))
        }
    }
}

@SuppressLint("MissingPermission")
@Composable
fun AddressEditor(title: String, state: AddressState, saved: List<SavedAddress>) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<GeoAddress>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var map by remember { mutableStateOf(false) }
    var more by remember { mutableStateOf(false) }

    fun choose(lat: Double, lng: Double) {
        busy = true; error = null
        scope.launch {
            try { state.fill(Geo.reverse(context, lat, lng)); results = emptyList(); query = "" } catch (e: Exception) { error = errorText(e) } finally { busy = false }
        }
    }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted.values.any { it }) {
            busy = true
            scope.launch {
                try {
                    val loc = LocationServices.getFusedLocationProviderClient(context)
                        .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token).await()
                    if (loc == null) error = t("تعذر تحديد موقعك. فعّل الموقع وحاول مجدداً.", "Couldn't get your location. Turn location on and try again.")
                    else state.fill(Geo.reverse(context, loc.latitude, loc.longitude))
                } catch (e: Exception) { error = errorText(e) } finally { busy = false }
            }
        } else error = t("نحتاج إذن الموقع لتعبئة العنوان تلقائياً.", "Location permission is needed to fill the address for you.")
    }

    SectionCard(title = title, icon = Icons.Outlined.Place) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton({ permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) }, Modifier.weight(1f).heightIn(min = 52.dp), contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp)) {
                Icon(Icons.Outlined.MyLocation, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text(t("موقعي", "My location"), maxLines = 2, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
            OutlinedButton({ map = true }, Modifier.weight(1f).heightIn(min = 52.dp), contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp)) {
                Icon(Icons.Outlined.Map, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text(t("على الخريطة", "On the map"), maxLines = 2, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
        }
        if (saved.isNotEmpty()) Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            saved.forEach { a -> AssistChip({ state.fillSaved(a) }, { Text(a.label) }, leadingIcon = { Icon(Icons.Outlined.Bookmark, null, Modifier.size(16.dp)) }) }
        }
        OutlinedTextField(
            query, { query = it }, Modifier.fillMaxWidth(), singleLine = true,
            placeholder = { Text(t("ابحث عن حي أو مكان أو عنوان مختصر", "Search a district, place or short code")) },
            leadingIcon = { Icon(Icons.Outlined.Search, null) },
            trailingIcon = { if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = {
                val q = query.trim(); if (q.length < 2) return@KeyboardActions
                busy = true; error = null
                scope.launch {
                    try {
                        // a Saudi National Address short code (4 letters + 4 digits) fills everything at once
                        if (Regex("^[A-Za-z]{4}[0-9]{4}$").matches(q)) { state.fill(Api.geoShortcode(q)); results = emptyList(); query = "" }
                        else results = Geo.search(context, q).also { if (it.isEmpty()) error = t("لا نتائج", "No results") }
                    } catch (e: Exception) { error = errorText(e) } finally { busy = false }
                }
            }),
        )
        results.forEach { r ->
            ListItem(
                headlineContent = { Text(r.place_name ?: r.display_name, maxLines = 1) },
                supportingContent = { Text(r.display_name, maxLines = 2) },
                leadingContent = { Icon(Icons.Outlined.Place, null) },
                modifier = Modifier.clickable { choose(r.lat, r.lng) },
            )
        }
        ErrorNote(error)
        OutlinedTextField(state.address, { state.address = it }, Modifier.fillMaxWidth(), label = { Text(t("العنوان", "Address")) }, minLines = 2)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(state.district, { state.district = it }, Modifier.weight(1f), label = { Text(t("الحي", "District")) }, singleLine = true)
            OutlinedTextField(state.floor, { v -> state.floor = v.filter { it.isDigit() || it == '-' }.take(4) }, Modifier.width(96.dp), label = { Text(t("الطابق", "Floor")) },
                singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
        }
        // a toggle (Material switch), the whole row is the touch target
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(state.elevator, role = Role.Switch) { state.elevator = it },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.Elevator, null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(10.dp))
            Text(t("يوجد مصعد", "Elevator"), Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
            Switch(state.elevator, null)
        }
        TextButton({ more = !more }) {
            Icon(if (more) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp))
            Text(if (more) t("إخفاء تفاصيل العنوان", "Hide address details") else t("تفاصيل العنوان", "Address details"))
        }
        if (more) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(state.street, { state.street = it }, Modifier.weight(1f), label = { Text(t("الشارع", "Street")) }, singleLine = true)
                OutlinedTextField(state.building, { state.building = it }, Modifier.width(110.dp), label = { Text(t("رقم المبنى", "Bldg no.")) }, singleLine = true)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(state.postal, { state.postal = it }, Modifier.weight(1f), label = { Text(t("الرمز البريدي", "Postal code")) }, singleLine = true)
                OutlinedTextField(state.shortCode, { state.shortCode = it.uppercase().take(8) }, Modifier.weight(1f), label = { Text(t("العنوان المختصر", "Short code")) }, singleLine = true)
            }
        }
    }
    if (map) MapPicker(state.lat, state.lng, onDismiss = { map = false }) { lat, lng -> map = false; choose(lat, lng) }
}

/** full-screen map with a fixed centre pin; the point under the pin is chosen */
@Composable
fun MapPicker(lat: Double?, lng: Double?, onDismiss: () -> Unit, onPick: (Double, Double) -> Unit) {
    var center by remember { mutableStateOf(LatLng(lat ?: 24.7136, lng ?: 46.6753)) } // Riyadh by default
    var style by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { runCatching { Api.geoConfig() }.onSuccess { style = it.map_style_url ?: "" }.onFailure { style = "" } }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    // edge to edge, so the real system-bar insets reach the controls and nothing sits under the navigation bar
    Dialog(onDismiss, DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        // the dialog is laid out at the full display height, but some phones (Honor / Huawei) place its window between the
        // status bar and the navigation bar, so the bottom (with the button) hangs off the screen. Measure the part of the
        // screen the dialog can really show and keep everything inside it.
        val view = LocalView.current
        val density = LocalDensity.current
        var visibleHeight by remember { mutableStateOf<Int?>(null) }
        DisposableEffect(view) {
            val listener = ViewTreeObserver.OnGlobalLayoutListener {
                val frame = android.graphics.Rect().also { view.getWindowVisibleDisplayFrame(it) }
                val onScreen = IntArray(2).also { view.getLocationOnScreen(it) }
                // the dialog wraps its content, so compare with the screen, never with the dialog's own height
                val h = frame.bottom - onScreen[1]
                val next = if (h > 0) h else null
                if (next != visibleHeight) visibleHeight = next
            }
            view.viewTreeObserver.addOnGlobalLayoutListener(listener)
            onDispose { view.viewTreeObserver.removeOnGlobalLayoutListener(listener) }
        }
        val size = visibleHeight?.let { h -> Modifier.fillMaxWidth().height(with(density) { h.toDp() }) } ?: Modifier.fillMaxSize()
        Surface(size) {
            Box(Modifier.fillMaxSize()) {
                val s = style
                if (s != null) {
                    val context = LocalContext.current
                    // texture mode: the map draws inside the dialog's own window (a SurfaceView there can stay blank on some phones)
                    val view = remember {
                        MapView(context, MapLibreMapOptions.createFromAttributes(context).textureMode(true)).apply { onCreate(null) }
                    }
                    DisposableEffect(lifecycle, view) {
                        val obs = LifecycleEventObserver { _, e ->
                            when (e) {
                                Lifecycle.Event.ON_START -> view.onStart()
                                Lifecycle.Event.ON_RESUME -> view.onResume()
                                Lifecycle.Event.ON_PAUSE -> view.onPause()
                                Lifecycle.Event.ON_STOP -> view.onStop()
                                else -> {}
                            }
                        }
                        lifecycle.addObserver(obs)
                        view.onStart(); view.onResume()
                        onDispose { lifecycle.removeObserver(obs); view.onPause(); view.onStop(); view.onDestroy() }
                    }
                    AndroidView({ view }, Modifier.fillMaxSize()) { mv ->
                        mv.getMapAsync { m ->
                            if (m.style == null) {
                                if (s.isBlank()) m.setStyle(Style.Builder().fromUri(Geo.FREE_STYLE)) { st -> runCatching { Geo.localiseLabels(st) } }
                                else m.setStyle(Style.Builder().fromUri(s))
                                m.cameraPosition = CameraPosition.Builder().target(center).zoom(if (lat != null) 16.0 else 11.0).build()
                                m.addOnCameraIdleListener { m.cameraPosition.target?.let { center = it } }
                            }
                        }
                    }
                } else CircularProgressIndicator(Modifier.align(Alignment.Center))
                // the pin stays in the middle; the map moves under it
                Icon(Icons.Outlined.Place, null, Modifier.align(Alignment.Center).size(48.dp).offset(y = (-24).dp), tint = Brand.TealDark)
                Row(Modifier.align(Alignment.TopCenter).fillMaxWidth().windowInsetsPadding(WindowInsets.safeDrawing).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    FilledTonalIconButton(onDismiss) { Icon(Icons.Outlined.Close, t("إغلاق", "Close")) }
                    Spacer(Modifier.width(8.dp))
                    Surface(shape = MaterialTheme.shapes.medium, tonalElevation = 3.dp) {
                        Text(t("حرّك الخريطة حتى يكون الدبوس على المبنى", "Move the map until the pin is on the building"), Modifier.padding(10.dp), style = MaterialTheme.typography.bodyMedium)
                    }
                }
                PrimaryButton(t("اختيار هذا الموقع", "Use this location"), { onPick(center.latitude, center.longitude) },
                    Modifier.align(Alignment.BottomCenter).fillMaxWidth().windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 16.dp, vertical = 24.dp),
                    icon = Icons.Outlined.Check)
            }
        }
    }
}
