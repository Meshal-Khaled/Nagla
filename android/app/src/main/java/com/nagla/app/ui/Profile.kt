package com.nagla.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.nagla.app.BuildConfig
import com.nagla.app.data.Api
import com.nagla.app.data.Prefs
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

private data class ProfileData(val stats: com.nagla.app.data.Stats, val tech: com.nagla.app.data.TechProfile?)

@Composable
fun ProfileScreen(nav: NavHostController, bottom: @Composable () -> Unit) {
    val me = Session.me!!
    val scope = rememberCoroutineScope()
    val loader = rememberLoader {
        coroutineScope {
            val s = async { Api.stats() }
            val tp = async { if (me.role == "agent") Api.techProfile() else null }
            ProfileData(s.await(), tp.await())
        }
    }
    var edit by remember { mutableStateOf(false) }
    var help by remember { mutableStateOf(false) }
    AppScreen(t("الملف الشخصي", "Profile"), bottomBar = bottom, actions = {
        IconButton({ nav.navigate("settings") }) { Icon(Icons.Outlined.Settings, t("الإعدادات", "Settings")) }
    }) { pad ->
        RefreshList(loader, pad) { d ->
            item {
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(64.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), Alignment.Center) {
                            Text(me.name.take(1).uppercase(), style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(me.name, style = MaterialTheme.typography.titleLarge)
                            Text(roleName(me.role) + (me.company_name?.let { " · $it" } ?: ""), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                            Text(me.email, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            me.phone?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        }
                        IconButton({ edit = true }) { Icon(Icons.Outlined.Edit, t("تعديل", "Edit")) }
                    }
                    d.stats.member_since?.let { Text(t("عضو منذ ", "Member since ") + dateText(it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
            item { StatsGrid(me.role, d) }
            if (me.role == "agent" && d.tech != null) item {
                SectionCard(title = t("آخر التقييمات", "Recent reviews"), icon = Icons.Outlined.Reviews) {
                    if (d.tech.recent_reviews.isEmpty()) Text(t("لا توجد تقييمات بعد.", "No reviews yet."))
                    d.tech.recent_reviews.forEach { r -> InfoRow("#${r.move_no}", stars(r.stars) + (r.comment?.let { " · $it" } ?: "")) }
                }
            }
            item {
                SectionCard {
                    if (me.role == "customer") {
                        MenuRow(Icons.Outlined.Bookmarks, t("العناوين المحفوظة", "Saved addresses")) { nav.navigate("addresses") }
                        MenuRow(Icons.Outlined.Inventory2, t("الأرشيف", "Archive") + if (d.stats.archived > 0) " (${d.stats.archived})" else "") { nav.navigate("archive") }
                    }
                    MenuRow(Icons.Outlined.Lock, if (d.stats.has_password) t("تغيير كلمة المرور", "Change password") else t("تعيين كلمة مرور", "Set a password")) { nav.navigate("password") }
                    MenuRow(Icons.Outlined.Settings, t("الإعدادات: اللغة والمظهر", "Settings: language & theme")) { nav.navigate("settings") }
                    MenuRow(Icons.AutoMirrored.Outlined.HelpOutline, t("المساعدة والأسئلة الشائعة", "Help & FAQ")) { help = true }
                    MenuRow(Icons.AutoMirrored.Outlined.Logout, t("تسجيل الخروج", "Sign out"), danger = true) {
                        scope.launch { Api.logout(); Prefs.clearSession(); Session.me = null }
                    }
                }
            }
            if (d.stats.google_linked) item {
                Text(t("حسابك مرتبط بـ Google.", "Your account is linked to Google."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    if (edit) EditProfileDialog { edit = false }
    if (help) AlertDialog(onDismissRequest = { help = false }, confirmButton = { TextButton({ help = false }) { Text(t("إغلاق", "Close")) } },
        title = { Text(t("الأسئلة الشائعة", "FAQ")) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Faq(t("كيف يُحدّد السعر؟", "How is the price set?"), t("نحسب حجم أغراضك، ثم نختار لكل شركة الشاحنة المناسبة وعدد الرحلات.", "We work out your items' volume, then each company's fitting truck and trips."))
                Faq(t("هل أعدّل ما اكتشفه الذكاء الاصطناعي؟", "Can I fix what the AI found?"), t("نعم: أعد التسمية، غيّر الكمية، واسحب الصندوق إلى بيع أو نقل أو تبرع.", "Yes: rename, change quantities and slide the box to Sell, Move or Donate."))
                Faq(t("متى أستطيع الإلغاء؟", "When can I cancel?"), t("قبل انطلاق الفريق إليك.", "Until the crew is on the way."))
                Faq(t("المسودات", "Drafts"), t("لا تُحفظ المسودة إلا إذا اخترت حفظها. يمكنك أرشفتها.", "A draft is kept only if you save it. You can archive it."))
            }
        })
}

@Composable
private fun Faq(q: String, a: String) {
    Column { Text(q, fontWeight = FontWeight.Bold); Text(a, style = MaterialTheme.typography.bodyMedium) }
}

@Composable
private fun StatsGrid(role: String, d: ProfileData) {
    val s = d.stats
    val tiles: List<Pair<String, String>> = when (role) {
        "agent" -> listOf(
            t("نقل مكتمل", "Completed") to "${d.tech?.completed_moves ?: 0}",
            t("التقييم", "Rating") to (d.tech?.rating?.average?.toString() ?: "—") + " (${d.tech?.rating?.count ?: 0})",
            t("متوسط المهمة", "Avg job") to (d.tech?.performance?.avg_job_minutes?.let { "$it " + t("د", "min") } ?: "—"),
            t("آخر ٣٠ يوماً", "Last 30 days") to "${d.tech?.performance?.completed_last_30_days ?: 0}",
        )
        "company_admin" -> listOf(
            t("كل الطلبات", "All moves") to "${s.moves}", t("واردة", "Incoming") to "${s.incoming}",
            t("مكتملة", "Completed") to "${s.completed}", t("الفنيون", "Technicians") to "${s.technicians}",
        )
        else -> listOf(
            t("كل الطلبات", "All moves") to "${s.moves}", t("نشطة", "Active") to "${s.active}",
            t("مكتملة", "Completed") to "${s.completed}", t("مسودات", "Drafts") to "${s.drafts}",
            t("تقييمك من الفنيين", "Your rating") to (s.rating?.average?.toString() ?: "—"), t("مؤرشفة", "Archived") to "${s.archived}",
        )
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        tiles.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { (k, v) -> StatTile(k, v, Modifier.weight(1f)) }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun MenuRow(icon: ImageVector, text: String, danger: Boolean = false, onClick: () -> Unit) {
    val color = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
    ListItem(
        headlineContent = { Text(text, color = color) },
        leadingContent = { Icon(icon, null, tint = if (danger) color else MaterialTheme.colorScheme.primary) },
        trailingContent = { if (!danger) Icon(Icons.Outlined.ChevronRight, null) },
        modifier = Modifier.clickable(onClick = onClick),
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surface),
    )
}

@Composable
private fun EditProfileDialog(onClose: () -> Unit) {
    val me = Session.me!!
    var name by remember { mutableStateOf(me.name) }
    var phone by remember { mutableStateOf(me.phone ?: "") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    AlertDialog(onDismissRequest = onClose, title = { Text(t("تعديل الملف", "Edit profile")) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it.take(100) }, label = { Text(t("الاسم", "Name")) }, singleLine = true)
                OutlinedTextField(phone, { phone = it.filter { c -> c.isDigit() || c == '+' || c == ' ' }.take(20) }, label = { Text(t("رقم الجوال", "Mobile number")) }, singleLine = true,
                    placeholder = { Text("+966 5X XXX XXXX") })
                ErrorNote(error)
            }
        },
        confirmButton = {
            TextButton({
                busy = true
                scope.launch {
                    try { Api.patchMe(name.trim(), phone.trim().ifBlank { null }); Session.me = Api.me(); onClose() } catch (e: Exception) { error = errorText(e) } finally { busy = false }
                }
            }, enabled = !busy && name.isNotBlank()) { Text(t("حفظ", "Save")) }
        },
        dismissButton = { TextButton(onClose) { Text(t("إلغاء", "Cancel")) } })
}

@Composable
fun SettingsScreen(nav: NavHostController) {
    AppScreen(t("الإعدادات", "Settings"), onBack = { nav.popBackStack() }) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                SectionCard(title = t("اللغة", "Language"), icon = Icons.Outlined.Language) {
                    listOf("ar" to "العربية", "en" to "English").forEach { (k, label) ->
                        Row(Modifier.fillMaxWidth().clickable { Prefs.setLanguage(k) }, verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(Prefs.lang == k, { Prefs.setLanguage(k) }); Text(label)
                        }
                    }
                }
            }
            item {
                SectionCard(title = t("المظهر", "Appearance"), icon = Icons.Outlined.DarkMode) {
                    listOf("light" to t("فاتح", "Light"), "dark" to t("داكن", "Dark"), "system" to t("حسب الجهاز", "Follow the phone")).forEach { (k, label) ->
                        Row(Modifier.fillMaxWidth().clickable { Prefs.setThemeMode(k) }, verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(Prefs.theme == k, { Prefs.setThemeMode(k) }); Text(label)
                        }
                    }
                }
            }
            item {
                SectionCard(title = t("عن التطبيق", "About"), icon = Icons.Outlined.Info) {
                    InfoRow(t("الإصدار", "Version"), BuildConfig.VERSION_NAME)
                    InfoRow(t("الخادم", "Server"), Api.base.removePrefix("https://"))
                }
            }
        }
    }
}

@Composable
fun AddressesScreen(nav: NavHostController) {
    val loader = rememberLoader { Api.addresses() }
    val scope = rememberCoroutineScope()
    var adding by remember { mutableStateOf(false) }
    AppScreen(t("العناوين المحفوظة", "Saved addresses"), onBack = { nav.popBackStack() }, actions = {
        IconButton({ adding = true }) { Icon(Icons.Outlined.AddLocationAlt, t("إضافة", "Add")) }
    }) { pad ->
        if (adding) {
            val state = remember { AddressState() }
            var label by remember { mutableStateOf("") }
            var error by remember { mutableStateOf<String?>(null) }
            LazyColumn(Modifier.padding(pad), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { OutlinedTextField(label, { label = it.take(60) }, Modifier.fillMaxWidth(), label = { Text(t("الاسم (مثل: البيت، العمل)", "Name (e.g. Home, Work)")) }, singleLine = true) }
                item { AddressEditor(t("العنوان", "Address"), state, emptyList()) }
                item { ErrorNote(error) }
                item {
                    PrimaryButton(t("حفظ العنوان", "Save address"), {
                        scope.launch {
                            try {
                                Api.addAddress(label.trim(), state.address.trim(), state.lat, state.lng, state.floor.toIntOrNull(), state.elevator, state.details())
                                adding = false; loader.reload(true)
                            } catch (e: Exception) { error = errorText(e) }
                        }
                    }, Modifier.fillMaxWidth(), enabled = label.isNotBlank() && state.complete)
                }
            }
        } else RefreshList(loader, pad) { list ->
            if (list.isEmpty()) item { EmptyState(t("لا توجد عناوين محفوظة", "No saved addresses"), t("احفظ البيت أو العمل لتعبئة الطلبات بسرعة.", "Save home or work to fill moves faster."), Icons.Outlined.Bookmarks) }
            items(list, key = { it.id }) { a ->
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(a.label, style = MaterialTheme.typography.titleMedium)
                            Text(a.address, style = MaterialTheme.typography.bodyMedium)
                        }
                        IconButton({ scope.launch { runCatching { Api.deleteAddress(a.id) }; loader.reload(true) } }) { Icon(Icons.Outlined.DeleteOutline, t("حذف", "Delete"), tint = MaterialTheme.colorScheme.error) }
                    }
                }
            }
        }
    }
}

@Composable
fun PasswordScreen(nav: NavHostController) {
    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var done by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    AppScreen(t("كلمة المرور", "Password"), onBack = { nav.popBackStack() }) { pad ->
        Column(Modifier.padding(pad).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(current, { current = it }, Modifier.fillMaxWidth(), label = { Text(t("كلمة المرور الحالية", "Current password")) },
                singleLine = true, visualTransformation = PasswordVisualTransformation(),
                supportingText = { Text(t("اتركها فارغة إن كان حسابك عبر Google فقط.", "Leave empty if you only use Google.")) })
            OutlinedTextField(next, { next = it }, Modifier.fillMaxWidth(), label = { Text(t("كلمة المرور الجديدة (٨+)", "New password (8+)")) },
                singleLine = true, visualTransformation = PasswordVisualTransformation())
            ErrorNote(error)
            if (done) Text(t("تم تغيير كلمة المرور.", "Password changed."), color = MaterialTheme.colorScheme.primary)
            PrimaryButton(t("حفظ", "Save"), {
                busy = true; error = null
                scope.launch {
                    try { Api.changePassword(current.ifBlank { null }, next); done = true; current = ""; next = "" } catch (e: Exception) { error = errorText(e) } finally { busy = false }
                }
            }, Modifier.fillMaxWidth(), enabled = next.length >= 8, busy = busy)
        }
    }
}
