package com.nagla.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
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
import androidx.compose.ui.text.input.KeyboardType
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
    AppScreen(t("الملف الشخصي", "Profile"), bottomBar = bottom, actions = {
        IconButton({ nav.navigate("settings") }) { Icon(Icons.Outlined.Settings, t("الإعدادات", "Settings")) }
    }) { pad ->
        RefreshList(loader, pad) { d ->
            // the account card: who you are + everything about the account (details, password)
            item {
                SectionCard {
                    Column(
                        Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium)
                            .clickable(onClickLabel = t("المعلومات الشخصية", "Personal info")) { nav.navigate("account") }.padding(6.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(5.dp),
                    ) {
                        NaqlaIconTile(Icons.Outlined.Person, size = 72)
                        Text(me.name, style = MaterialTheme.typography.titleLarge, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                        Text(roleName(me.role) + (me.company_name?.let { " · $it" } ?: ""),
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                        Text(me.email, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    MenuRow(Icons.Outlined.Badge, t("المعلومات الشخصية", "Personal info"),
                        sub = listOfNotNull(me.phone, d.stats.member_since?.let { t("عضو منذ ", "Member since ") + dateText(it) }).joinToString(" · ")) { nav.navigate("account") }
                    MenuRow(Icons.Outlined.Lock, if (d.stats.has_password) t("تغيير كلمة المرور", "Change password") else t("تعيين كلمة مرور", "Set a password"),
                        sub = if (d.stats.google_linked) t("مرتبط بحساب Google", "Linked to Google") else null) { nav.navigate("password") }
                }
            }
            if (me.role == "agent") item { StatsGrid(me.role, d) }
            if (me.role == "agent" && d.tech != null) item {
                SectionCard(title = t("آخر التقييمات", "Recent reviews"), icon = Icons.Outlined.Reviews) {
                    if (d.tech.recent_reviews.isEmpty()) Text(t("لا توجد تقييمات بعد.", "No reviews yet."))
                    d.tech.recent_reviews.forEach { r -> InfoRow("#${r.move_no}", stars(r.stars) + (r.comment?.let { " · $it" } ?: "")) }
                }
            }
            item {
                SectionCard {
                    if (me.role == "customer") MenuRow(Icons.Outlined.Bookmarks, t("العناوين المحفوظة", "Saved addresses")) { nav.navigate("addresses") }
                    MenuRow(Icons.Outlined.Settings, t("الإعدادات: اللغة والمظهر", "Settings: language & theme")) { nav.navigate("settings") }
                    MenuRow(Icons.AutoMirrored.Outlined.HelpOutline, t("المساعدة والأسئلة الشائعة", "Help & FAQ")) { nav.navigate("help") }
                    MenuRow(Icons.Outlined.SupportAgent, t("تواصل معنا", "Contact us"), sub = t("مساعد نقلة يرد عليك فوراً", "Naqla's assistant answers right away")) { nav.navigate("contact") }
                    MenuRow(Icons.Outlined.Policy, t("السياسات والخصوصية", "Policies & privacy")) { nav.navigate("policies") }
                    MenuRow(Icons.Outlined.Cookie, t("ملفات الارتباط والأذونات", "Cookies & permissions")) { nav.navigate("permissions") }
                    MenuRow(Icons.AutoMirrored.Outlined.Logout, t("تسجيل الخروج", "Sign out"), danger = true) {
                        scope.launch { Api.logout(); Prefs.clearSession(); Session.me = null }
                    }
                }
            }
        }
    }
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
private fun MenuRow(icon: ImageVector, text: String, danger: Boolean = false, sub: String? = null, onClick: () -> Unit) {
    val color = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
    ListItem(
        headlineContent = { Text(text, color = color) },
        supportingContent = if (sub.isNullOrBlank()) null else ({ Text(sub, style = MaterialTheme.typography.bodySmall) }),
        leadingContent = { Icon(icon, null, tint = if (danger) color else MaterialTheme.colorScheme.primary) },
        trailingContent = { if (!danger) Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null) },
        modifier = Modifier.clickable(onClick = onClick),
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surface),
    )
}

/** profile picture: a person icon */
@Composable
fun Avatar(size: Int) {
    Box(Modifier.size(size.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), Alignment.Center) {
        Icon(Icons.Outlined.Person, null, Modifier.size((size * 0.58f).dp), tint = MaterialTheme.colorScheme.primary)
    }
}

/** the account page (opened from the profile card): picture, name, phone, email, and security */
@Composable
fun AccountScreen(nav: NavHostController) {
    val me = Session.me!!
    var name by remember { mutableStateOf(me.name) }
    var phone by remember { mutableStateOf(me.phone ?: "") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val changed = name.trim() != me.name || phone.trim() != (me.phone ?: "")
    AppScreen(t("المعلومات الشخصية", "Personal info"), onBack = { nav.popBackStack() }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Avatar(104)
                Spacer(Modifier.height(8.dp))
                Text(roleName(me.role) + (me.company_name?.let { " · $it" } ?: ""), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
            }
            SectionCard(title = t("البيانات", "Details"), icon = Icons.Outlined.Badge) {
                OutlinedTextField(name, { name = it.take(100); saved = false }, Modifier.fillMaxWidth(), label = { Text(t("الاسم", "Name")) }, singleLine = true,
                    leadingIcon = { Icon(Icons.Outlined.Person, null) })
                OutlinedTextField(phone, { phone = it.filter { c -> c.isDigit() || c == '+' || c == ' ' }.take(20); saved = false }, Modifier.fillMaxWidth(),
                    label = { Text(t("رقم الجوال", "Mobile number")) }, singleLine = true, placeholder = { Text("+966 5X XXX XXXX") },
                    leadingIcon = { Icon(Icons.Outlined.Phone, null) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
                OutlinedTextField(me.email, {}, Modifier.fillMaxWidth(), label = { Text(t("البريد الإلكتروني", "Email")) }, singleLine = true, readOnly = true, enabled = false,
                    leadingIcon = { Icon(Icons.Outlined.Email, null) })
                ErrorNote(error)
                if (saved) Text(t("تم الحفظ.", "Saved."), color = MaterialTheme.colorScheme.primary)
                PrimaryButton(t("حفظ التغييرات", "Save changes"), {
                    busy = true; error = null
                    scope.launch {
                        try { Api.patchMe(name.trim(), phone.trim().ifBlank { null }); Session.me = Api.me(); saved = true } catch (e: Exception) { error = errorText(e) } finally { busy = false }
                    }
                }, Modifier.fillMaxWidth(), enabled = changed && name.isNotBlank(), busy = busy)
            }
            SectionCard(title = t("الأمان", "Security"), icon = Icons.Outlined.Shield) {
                MenuRow(Icons.Outlined.Lock, t("كلمة المرور", "Password")) { nav.navigate("password") }
            }
        }
    }
}

@Composable
fun SettingsScreen(nav: NavHostController) {
    AppScreen(t("الإعدادات", "Settings"), onBack = { nav.popBackStack() }) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                SectionCard(title = t("اللغة", "Language"), icon = Icons.Outlined.Language) {
                    listOf("ar" to "العربية", "en" to "English").forEach { (k, label) ->
                        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).selectable(Prefs.lang == k, role = Role.RadioButton) { Prefs.setLanguage(k) }, verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(Prefs.lang == k, null); Spacer(Modifier.width(12.dp)); Text(label)
                        }
                    }
                }
            }
            item {
                SectionCard(title = t("المظهر", "Appearance"), icon = Icons.Outlined.DarkMode) {
                    listOf("light" to t("فاتح", "Light"), "dark" to t("داكن", "Dark"), "system" to t("حسب الجهاز", "Follow the phone")).forEach { (k, label) ->
                        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).selectable(Prefs.theme == k, role = Role.RadioButton) { Prefs.setThemeMode(k) }, verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(Prefs.theme == k, null); Spacer(Modifier.width(12.dp)); Text(label)
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
    var again by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var done by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    AppScreen(t("كلمة المرور", "Password"), onBack = { nav.popBackStack() }) { pad ->
        Column(Modifier.padding(pad).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(current, { current = it }, Modifier.fillMaxWidth(), label = { Text(t("كلمة المرور الحالية", "Current password")) },
                singleLine = true, visualTransformation = PasswordVisualTransformation(),
                supportingText = { Text(t("اتركها فارغة إن كان حسابك عبر Google فقط.", "Leave empty if you only use Google.")) })
            OutlinedTextField(next, { next = it; done = false }, Modifier.fillMaxWidth(), label = { Text(t("كلمة المرور الجديدة (٨+)", "New password (8+)")) },
                singleLine = true, visualTransformation = PasswordVisualTransformation())
            val mismatch = again.isNotEmpty() && again != next
            OutlinedTextField(again, { again = it }, Modifier.fillMaxWidth(), label = { Text(t("تأكيد كلمة المرور الجديدة", "Confirm new password")) },
                singleLine = true, visualTransformation = PasswordVisualTransformation(), isError = mismatch,
                supportingText = if (mismatch) ({ Text(t("كلمتا المرور غير متطابقتين", "The passwords don't match")) }) else null)
            ErrorNote(error)
            if (done) Text(t("تم تغيير كلمة المرور.", "Password changed."), color = MaterialTheme.colorScheme.primary)
            PrimaryButton(t("حفظ", "Save"), {
                busy = true; error = null
                scope.launch {
                    try { Api.changePassword(current.ifBlank { null }, next); done = true; current = ""; next = ""; again = "" } catch (e: Exception) { error = errorText(e) } finally { busy = false }
                }
            }, Modifier.fillMaxWidth(), enabled = next.length >= 8 && again == next, busy = busy)
        }
    }
}
