package com.nagla.app.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.navigation.NavHostController
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.LocalDate

// ---------- a card that opens downwards to show its answer (Help & FAQ, policies)

@Composable
fun ExpandCard(title: String, icon: ImageVector? = null, startOpen: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    var open by rememberSaveable(title) { mutableStateOf(startOpen) }
    val turn by animateFloatAsState(if (open) 180f else 0f, tween(250), label = "chevron")
    val colors = MaterialTheme.colorScheme
    Surface(
        Modifier.fillMaxWidth().animateContentSize(tween(250)),
        shape = MaterialTheme.shapes.large, color = colors.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, if (open) colors.primary else colors.outlineVariant),
    ) {
        Column {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 56.dp)
                    .clickable(role = Role.Button, onClickLabel = if (open) t("إخفاء الإجابة", "Hide the answer") else t("إظهار الإجابة", "Show the answer")) { open = !open }
                    .semantics { stateDescription = if (open) t("مفتوح", "Expanded") else t("مغلق", "Collapsed") }
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (icon != null) { NaqlaIconTile(icon, size = 36); Spacer(Modifier.width(12.dp)) }
                Text(title, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Icon(Icons.Outlined.ExpandMore, null, Modifier.rotate(turn), tint = colors.primary)
            }
            AnimatedVisibility(open, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
                Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
            }
        }
    }
}

@Composable
private fun Para(text: String) = Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

@Composable
private fun Bullet(text: String) {
    Row {
        Text("•", Modifier.padding(end = 8.dp), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ---------- Help & FAQ

private data class FaqEntry(val q: () -> String, val a: () -> String, val icon: ImageVector)

private val FAQ = listOf(
    FaqEntry({ t("ما هي نقلة، ولمن هي؟", "What is Naqla, and who is it for?") }, {
        t("نقلة تطبيق سعودي لنقل العفش من بيت لبيت. تصوّر غرفك، فيتعرّف الذكاء الاصطناعي على أغراضك ويحسب حجمها، ثم تقارن عروض شركات النقل القادرة على حمل أغراضك، تحجز، وتتابع نقلتك خطوة بخطوة.\n\nنخدم ثلاث فئات: الأسر والأفراد الذين ينقلون بيوتهم، وشركات النقل التي تستقبل الطلبات وتديرها، وفنيي الشركات الذين ينفّذون النقل ويحدّثون مراحله.",
            "Naqla is a Saudi app for moving home. You photograph your rooms, AI recognises your things and works out their volume, then you compare offers from moving companies that can carry them, book one, and follow your move step by step.\n\nIt serves three groups: households moving home, moving companies that receive and run the orders, and the companies' technicians who carry out the move and update each stage.")
    }, Icons.Outlined.Info),
    FaqEntry({ t("كيف يُحدَّد السعر؟", "How is the price set?") }, {
        t("نحسب حجم أغراضك من الصور، ثم نعرض الشركات التي تملك شاحنة تكفي أغراضك، ولكل شركة سعرها حسب الشاحنة والمسافة والخدمات.",
            "We work out your items' volume from the photos, then show the companies with a truck big enough for it, each with its own price for the truck, distance and services.")
    }, Icons.Outlined.Payments),
    FaqEntry({ t("هل أستطيع تعديل ما اكتشفه الذكاء الاصطناعي؟", "Can I fix what the AI found?") }, {
        t("نعم. غيّر الاسم أو الكمية، احذف ما لا تريد، أو أضف قطعة باسمك الخاص. واسحب كل قطعة إلى نقل أو بيع أو تبرع.",
            "Yes. Change a name or quantity, delete what you don't need, or add an item under your own name. Slide each item to Move, Sell or Donate.")
    }, Icons.Outlined.Edit),
    FaqEntry({ t("متى أستطيع إلغاء الطلب؟", "When can I cancel?") }, {
        t("في أي وقت قبل انطلاق الفريق إليك. سنسألك عن السبب لنحسّن الخدمة.",
            "Any time before the crew sets off. We'll ask why, so we can do better.")
    }, Icons.Outlined.EventBusy),
    FaqEntry({ t("كيف أتابع نقلتي؟", "How do I follow my move?") }, {
        t("من صفحة الطلب ترى المرحلة الحالية، والفني المسؤول، ويمكنك محادثة فريق النقل مباشرة.",
            "The move page shows the current stage and your technician, and you can chat with the moving team there.")
    }, Icons.Outlined.LocalShipping),
    FaqEntry({ t("هل صوري آمنة؟", "Are my photos safe?") }, {
        t("تُستخدم صورك لتعرّف أغراضك فقط، ولا تراها إلا الشركة التي تحجز معها. التفاصيل في «السياسات والخصوصية».",
            "Your photos are used only to recognise your items, and only the company you book can see them. Details are in \"Policies & privacy\".")
    }, Icons.Outlined.Lock),
    FaqEntry({ t("ماذا عن المسودات؟", "What about drafts?") }, {
        t("لا تُحفظ المسودة إلا إذا اخترت حفظها، ويمكنك إكمالها لاحقاً من الصفحة الرئيسية.",
            "A draft is kept only if you choose to save it, and you can finish it later from the home screen.")
    }, Icons.Outlined.EditNote),
)

@Composable
fun HelpScreen(nav: NavHostController) {
    AppScreen(t("المساعدة والأسئلة الشائعة", "Help & FAQ"), onBack = { nav.popBackStack() }) { pad ->
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = pad.calculateTopPadding() + 8.dp, bottom = pad.calculateBottomPadding() + 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { StepHeader(t("كيف نقدر نساعدك؟", "How can we help?"), t("اضغط على السؤال لترى الإجابة.", "Tap a question to see the answer.")) }
            items(FAQ.size) { i ->
                val f = FAQ[i]
                ExpandCard(f.q(), f.icon, startOpen = i == 0) { Para(f.a()) }
            }
            item {
                SectionCard {
                    Text(t("ما لقيت جوابك؟", "Didn't find your answer?"), style = MaterialTheme.typography.titleMedium)
                    PrimaryButton(t("تحدّث معنا", "Chat with us"), { nav.navigate("contact") }, Modifier.fillMaxWidth(), icon = Icons.Outlined.SupportAgent)
                }
            }
        }
    }
}

// ---------- Policies & privacy

@Composable
fun PoliciesScreen(nav: NavHostController) {
    AppScreen(t("السياسات والخصوصية", "Policies & privacy"), onBack = { nav.popBackStack() }) { pad ->
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = pad.calculateTopPadding() + 8.dp, bottom = pad.calculateBottomPadding() + 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                StepHeader(t("خصوصيتك تهمنا", "Your privacy matters"),
                    t("بكلام بسيط: ماذا نجمع، ولماذا، ومن يراه.", "In plain words: what we collect, why, and who sees it."))
            }
            item {
                ExpandCard(t("ما البيانات التي نجمعها؟", "What we collect"), Icons.Outlined.Inventory2, startOpen = true) {
                    Bullet(t("بيانات حسابك: الاسم والبريد الإلكتروني ورقم الجوال.", "Your account: name, email and phone number."))
                    Bullet(t("تفاصيل النقلة: العناوين والموعد والملاحظات.", "Your move: addresses, date and notes."))
                    Bullet(t("صور الغرف وقائمة الأغراض التي تراجعها.", "Room photos and the item list you review."))
                    Bullet(t("موقعك فقط عندما تضغط «موقعي» لتعبئة العنوان.", "Your location, only when you tap \"My location\" to fill an address."))
                    Bullet(t("المحادثات والتقييمات داخل الطلب.", "Chats and ratings inside a move."))
                }
            }
            item {
                ExpandCard(t("كيف نستخدمها؟", "How we use it"), Icons.Outlined.AutoAwesome) {
                    Bullet(t("لتعرّف أغراضك من الصور وحساب حجمها؛ تُحلَّل الصور بخدمات ذكاء اصطناعي (Google Gemini وAnthropic Claude).",
                        "To recognise your items and their volume; photos are analysed by AI services (Google Gemini and Anthropic Claude)."))
                    Bullet(t("لعرض الشركات المناسبة وأسعارها.", "To show the right companies and their prices."))
                    Bullet(t("لتنفيذ النقلة ومتابعتها وإرسال تحديثاتها.", "To run your move and keep you updated."))
                    Bullet(t("لا نبيع بياناتك ولا نستخدمها للإعلانات.", "We don't sell your data or use it for ads."))
                }
            }
            item {
                ExpandCard(t("من يرى بياناتك؟", "Who sees your data"), Icons.Outlined.Groups) {
                    Bullet(t("الشركة التي تحجز معها، والفني المسؤول عن نقلتك.", "The company you book, and the technician on your move."))
                    Bullet(t("لا تظهر بياناتك لأي شركة أخرى.", "No other company sees your details."))
                }
            }
            item {
                ExpandCard(t("حقوقك", "Your rights"), Icons.Outlined.VerifiedUser) {
                    Bullet(t("عدّل بياناتك من الملف الشخصي في أي وقت.", "Edit your details from your profile at any time."))
                    Bullet(t("اطلب نسخة من بياناتك أو حذف حسابك عبر «تواصل معنا».", "Ask for a copy of your data or to delete your account through \"Contact us\"."))
                    Bullet(t("تحكّم في أذونات الكاميرا والموقع من «ملفات الارتباط والأذونات».", "Control camera and location access in \"Cookies & permissions\"."))
                }
            }
            item {
                ExpandCard(t("شروط الاستخدام", "Terms of use"), Icons.Outlined.Gavel) {
                    Bullet(t("الحجز اتفاق بينك وبين شركة النقل، ونقلة تنظّم الطلب وتتابعه.", "A booking is an agreement between you and the moving company; Naqla arranges and tracks it."))
                    Bullet(t("السعر مبني على الأغراض في قائمتك؛ أغراض إضافية يوم النقل قد تغيّر السعر.", "The price is based on your item list; extra items on the day may change it."))
                    Bullet(t("يمكنك الإلغاء قبل انطلاق الفريق إليك.", "You can cancel until the crew sets off."))
                    Bullet(t("التقييمات يجب أن تكون صادقة ومحترمة.", "Ratings must be honest and respectful."))
                }
            }
            item {
                Text(t("آخر تحديث: نوفمبر ٢٠٢٦", "Last updated: November 2026"), Modifier.padding(top = 4.dp),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ---------- Cookies (what the app keeps on the phone) & permissions

private data class PermissionInfo(val permission: String, val icon: ImageVector, val name: () -> String, val why: () -> String)

private val RUNTIME_PERMISSIONS = listOf(
    PermissionInfo(Manifest.permission.CAMERA, Icons.Outlined.PhotoCamera,
        { t("الكاميرا", "Camera") }, { t("لتصوير غرفك، ولصور مراحل النقل عند الفني.", "To photograph your rooms, and for the technician's stage photos.") }),
    PermissionInfo(Manifest.permission.ACCESS_FINE_LOCATION, Icons.Outlined.MyLocation,
        { t("الموقع", "Location") }, { t("لتعبئة العنوان من مكانك الحالي، فقط عندما تطلب ذلك.", "To fill an address from where you are, only when you ask.") }),
)

@Composable
fun PermissionsScreen(nav: NavHostController) {
    val context = LocalContext.current
    // re-read the permissions each time the screen comes back (the user may change them in the system settings)
    var tick by remember { mutableIntStateOf(0) }
    LifecycleResumeEffect(Unit) { tick++; onPauseOrDispose { } }
    val granted = remember(tick) {
        RUNTIME_PERMISSIONS.associate { it.permission to (ContextCompat.checkSelfPermission(context, it.permission) == PackageManager.PERMISSION_GRANTED) }
    }
    fun openSettings() {
        context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    AppScreen(t("ملفات الارتباط والأذونات", "Cookies & permissions"), onBack = { nav.popBackStack() }) { pad ->
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = pad.calculateTopPadding() + 8.dp, bottom = pad.calculateBottomPadding() + 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { StepHeader(t("ما نحفظه وما نطلبه", "What we keep and what we ask for"), t("كل شيء هنا ضروري لعمل التطبيق فقط.", "Everything here is only what the app needs to work.")) }
            item {
                SectionCard(title = t("ملفات الارتباط والبيانات المحفوظة", "Cookies & stored data"), icon = Icons.Outlined.Cookie) {
                    Para(t("لا يستخدم التطبيق ملفات ارتباط إعلانية ولا أدوات تتبّع. يحفظ على جهازك هذه فقط:",
                        "The app uses no advertising cookies and no trackers. It keeps only these on your phone:"))
                    StoredRow(t("رمز الدخول", "Sign-in token"), t("لتبقى مسجّلاً. يُحذف عند تسجيل الخروج.", "Keeps you signed in. Removed when you sign out."))
                    StoredRow(t("اللغة", "Language"), t("العربية أو الإنجليزية.", "Arabic or English."))
                    StoredRow(t("المظهر", "Theme"), t("فاتح أو داكن أو حسب النظام.", "Light, dark or system."))
                    Para(t("لا تُنسخ هذه البيانات في النسخ الاحتياطي السحابي.", "None of this is copied to cloud backups."))
                }
            }
            item {
                SectionCard(title = t("الأذونات", "Permissions"), icon = Icons.Outlined.AdminPanelSettings) {
                    RUNTIME_PERMISSIONS.forEach { p ->
                        val on = granted[p.permission] == true
                        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).semantics(mergeDescendants = true) { }, verticalAlignment = Alignment.CenterVertically) {
                            NaqlaIconTile(p.icon, size = 40)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(p.name(), style = MaterialTheme.typography.titleMedium)
                                Text(p.why(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Spacer(Modifier.width(8.dp))
                            StatusPill(if (on) t("مسموح", "Allowed") else t("غير مسموح", "Not allowed"), on)
                        }
                    }
                    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).semantics(mergeDescendants = true) { }, verticalAlignment = Alignment.CenterVertically) {
                        NaqlaIconTile(Icons.Outlined.Wifi, size = 40)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(t("الإنترنت", "Internet"), style = MaterialTheme.typography.titleMedium)
                            Text(t("للاتصال بنقلة. لا يحتاج موافقة.", "To connect to Naqla. Needs no prompt."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Spacer(Modifier.width(8.dp))
                        StatusPill(t("دائماً", "Always"), true)
                    }
                    OutlinedButton(::openSettings, Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = MaterialTheme.shapes.medium) {
                        Icon(Icons.Outlined.Settings, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp))
                        Text(t("تغيير الأذونات من إعدادات الجهاز", "Change them in the phone settings"))
                    }
                }
            }
        }
    }
}

@Composable
private fun StoredRow(name: String, why: String) {
    Row(Modifier.fillMaxWidth().semantics(mergeDescendants = true) { }, verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(name, style = MaterialTheme.typography.titleSmall)
            Text(why, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.width(8.dp))
        StatusPill(t("ضروري", "Essential"), true)
    }
}

@Composable
private fun StatusPill(text: String, on: Boolean) {
    val colors = MaterialTheme.colorScheme
    Surface(shape = RoundedCornerShape(50), color = if (on) colors.primaryContainer else colors.surfaceVariant,
        contentColor = if (on) colors.onPrimaryContainer else colors.onSurfaceVariant) {
        Text(text, Modifier.padding(horizontal = 10.dp, vertical = 4.dp), style = MaterialTheme.typography.labelMedium)
    }
}

// ---------- Contact us: the assistant answers first; a person (the moving team chat) after that

private data class BotTopic(val key: String, val chip: () -> String, val words: List<String>, val answer: () -> String)

private val BOT_TOPICS = listOf(
    BotTopic("about", { t("ما هي نقلة؟", "What is Naqla?") }, listOf("نقلة", "naqla", "تطبيق", "app", "what is", "ايش", "وش"), FAQ[0].a),
    BotTopic("price", { t("كيف يُحسب السعر؟", "How is the price set?") }, listOf("سعر", "اسعار", "أسعار", "تكلفة", "كم", "price", "cost", "quote", "offer", "عرض"), FAQ[1].a),
    BotTopic("items", { t("تعديل الأغراض", "Fixing my items") }, listOf("غرض", "اغراض", "أغراض", "قطعة", "ذكاء", "مسح", "item", "scan", "ai", "furniture", "اثاث", "أثاث"), FAQ[2].a),
    BotTopic("cancel", { t("إلغاء طلب", "Cancelling") }, listOf("الغاء", "إلغاء", "الغي", "ألغي", "cancel", "refund", "استرجاع"), FAQ[3].a),
    BotTopic("track", { t("متابعة النقلة", "Following my move") }, listOf("تتبع", "تتبّع", "متابعة", "وين", "مرحلة", "track", "where", "status", "stage", "فني", "technician"), FAQ[4].a),
    BotTopic("privacy", { t("الخصوصية والصور", "Privacy & photos") }, listOf("خصوصية", "صور", "صورة", "بيانات", "privacy", "photo", "data", "delete", "حذف"), FAQ[5].a),
    BotTopic("human", { t("أبغى أكلم شخص", "Talk to a person") }, listOf("موظف", "شخص", "انسان", "إنسان", "خدمة العملاء", "human", "person", "agent", "support", "شكوى", "complaint"), {
        t("أكيد! لنقلة محجوزة، افتح الطلب واضغط «محادثة فريق النقل» لتتكلم مع الشركة مباشرة. ولطلبات الحساب والبيانات اكتب طلبك هنا وسنرجع لك.",
            "Sure! For a booked move, open it and tap \"Chat with the moving team\" to talk to the company directly. For account or data requests, write it here and we'll get back to you.")
    }),
)

private val GREETINGS = listOf("مرحبا", "هلا", "السلام", "اهلا", "أهلا", "hi", "hello", "hey", "salam")
private val THANKS = listOf("شكرا", "شكراً", "مشكور", "يعطيك", "thanks", "thank you", "thx")

/** the assistant's answer to free text: the topic with the most matching words, or a friendly fallback */
private fun botReply(text: String): Pair<String, String?> {
    val q = text.lowercase()
    if (THANKS.any { it in q }) return t("العفو! أي شيء ثاني؟", "You're welcome! Anything else?") to null
    val best = BOT_TOPICS.map { topic -> topic to topic.words.count { it in q } }.filter { it.second > 0 }.maxByOrNull { it.second }?.first
    if (best != null) return best.answer() to best.key
    if (GREETINGS.any { it in q }) return t("هلا والله! كيف أقدر أساعدك؟", "Hi there! How can I help?") to null
    return t("ما فهمت عليك تماماً 🙏 اختر موضوعاً من الأسفل، أو اطلب التحدث مع شخص.",
        "I didn't quite get that 🙏 Pick a topic below, or ask to talk to a person.") to null
}

@Composable
fun ContactScreen(nav: NavHostController) {
    val me = Session.me
    val scope = rememberCoroutineScope()
    val list = rememberLazyListState()
    // the conversation survives rotation: "b:" is the assistant, "u:" is you
    val greeting = t("هلا ${me?.name?.substringBefore(' ') ?: ""}! 👋 أنا مساعد نقلة. اسألني عن الأسعار أو الإلغاء أو متابعة نقلتك.",
        "Hi ${me?.name?.substringBefore(' ') ?: ""}! 👋 I'm Naqla's assistant. Ask me about prices, cancelling or following your move.")
    val log = rememberSaveable(saver = listSaver<SnapshotStateList<String>, String>(save = { it.toList() }, restore = { it.toMutableStateList() })) { mutableStateListOf("b:$greeting") }
    var text by rememberSaveable { mutableStateOf("") }
    var typing by remember { mutableStateOf(false) }
    var showMoves by rememberSaveable { mutableStateOf(false) }

    fun ask(question: String, topic: BotTopic? = null) {
        val q = question.trim()
        if (q.isEmpty() || typing) return
        log.add("u:$q"); text = ""; typing = true
        scope.launch {
            list.animateScrollToItem(log.size - 1)
            delay(650) // a short "typing…" so the answer doesn't feel like a wall of text
            val (answer, key) = topic?.let { it.answer() to it.key } ?: botReply(q)
            log.add("b:$answer"); typing = false
            if (key == "human" || key == "track" || key == "cancel") showMoves = true
            list.animateScrollToItem(log.size - 1)
        }
    }

    AppScreen(t("تواصل معنا", "Contact us"), onBack = { nav.popBackStack() }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().imePadding()) {
            LazyColumn(Modifier.weight(1f), state = list, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(log.size) { i ->
                    val line = log[i]
                    BotBubble(line.substring(2), mine = line.startsWith("u:"))
                }
                if (typing) item { BotBubble("…", mine = false, typing = true) }
            }
            // quick topics, then the chat box
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (showMoves && me?.role == "customer") AssistChip({ nav.navigate("moves") }, { Text(t("افتح طلباتي", "Open my moves")) },
                    leadingIcon = { Icon(Icons.Outlined.ListAlt, null, Modifier.size(18.dp)) })
                BOT_TOPICS.forEach { topic -> SuggestionChip({ ask(topic.chip(), topic) }, { Text(topic.chip()) }, enabled = !typing) }
            }
            Surface(tonalElevation = 3.dp) {
                Row(Modifier.fillMaxWidth().padding(10.dp).navigationBarsPadding(), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(text, { text = it.take(500) }, Modifier.weight(1f), shape = MaterialTheme.shapes.medium,
                        placeholder = { Text(t("اكتب سؤالك", "Type your question")) }, maxLines = 4)
                    Spacer(Modifier.width(8.dp))
                    FilledIconButton({ ask(text) }, Modifier.size(52.dp), enabled = text.isNotBlank() && !typing) {
                        Icon(Icons.AutoMirrored.Outlined.Send, t("إرسال", "Send"))
                    }
                }
            }
        }
    }
}

@Composable
private fun BotBubble(text: String, mine: Boolean, typing: Boolean = false) {
    val colors = MaterialTheme.colorScheme
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start, verticalAlignment = Alignment.Bottom) {
        if (!mine) { NaqlaIconTile(Icons.Outlined.SupportAgent, size = 32); Spacer(Modifier.width(8.dp)) }
        Text(
            text,
            Modifier.widthIn(max = 290.dp)
                .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = if (mine) 16.dp else 4.dp, bottomEnd = if (mine) 4.dp else 16.dp))
                .background(if (mine) colors.primaryContainer else colors.surface)
                .padding(horizontal = 14.dp, vertical = 10.dp)
                .then(if (!mine) Modifier.semantics { liveRegion = LiveRegionMode.Polite } else Modifier),
            style = MaterialTheme.typography.bodyMedium,
            color = if (typing) colors.onSurfaceVariant else if (mine) colors.onPrimaryContainer else colors.onSurface,
        )
    }
}

// ---------- the home screen's line of the day: a light question, tap to see the answer

private val DAILY = listOf(
    "أفضل كرتون للكتب؟" to "الصغير! الكتب ثقيلة، والكرتون الصغير يسهل حمله." to ("Best box for books?" to "A small one! Books are heavy, small boxes are easy to carry."),
    "متى تبدأ التغليف؟" to "قبل أسبوعين، وابدأ بالأشياء اللي ما تستخدمها كل يوم." to ("When should you start packing?" to "Two weeks before, starting with things you don't use every day."),
    "وش أول كرتون تفتحه في البيت الجديد؟" to "كرتون «الليلة الأولى»: شاحن، أدوات حمّام، ملابس يوم، وغلاية." to ("Which box do you open first?" to "The \"first night\" box: charger, toiletries, a change of clothes and a kettle."),
    "تعرف وش يحمي الصحون؟" to "رصّها بشكل عمودي مثل الملفات، مع ورق بين كل صحن." to ("How do you protect plates?" to "Stand them on edge like files, with paper between each one."),
    "صوّر خلف التلفزيون قبل الفك!" to "صورة للأسلاك توفر عليك نص ساعة تركيب." to ("Photograph the back of the TV first!" to "A photo of the cables saves you half an hour later."),
    "قطعة ما تحتاجها؟" to "حرّكها إلى «تبرع» أو «بيع»… نقلة أخف وسعر أقل." to ("Got something you don't need?" to "Slide it to Donate or Sell… a lighter move and a lower price."),
    "سؤال اليوم: كم كرتون يحتاج بيتك؟" to "تقريباً ١٠ كراتين لكل غرفة. نقلة تحسب الباقي عنك." to ("Today's question: how many boxes?" to "About 10 per room. Naqla works out the rest."),
    "الأغراض الثمينة وين تكون؟" to "معك في سيارتك: الذهب، الأوراق المهمة، والشواحن." to ("Where do valuables go?" to "With you in your car: jewellery, important papers and chargers."),
    "اكتب على الكرتون من الجنب!" to "لما تتكدّس الكراتين، الجنب هو اللي يبان." to ("Label boxes on the side!" to "When boxes are stacked, the side is what you see."),
    "تبغى نقلة أسرع؟" to "فرّغ الدواليب قبل يوم النقل، وخلّ الممرات فاضية." to ("Want a faster move?" to "Empty the wardrobes before the day and keep the hallways clear."),
    "وش تسوي بالبراغي؟" to "حطها في كيس صغير والصقه على القطعة نفسها." to ("What about the screws?" to "Put them in a small bag taped to the piece itself."),
    "مكيف ولا ثلاجة؟" to "افصل الثلاجة ونظّفها قبل النقل بيوم عشان تنشف." to ("Moving a fridge?" to "Unplug and clean it a day before so it can dry."),
    "بيت جديد = بداية جديدة 🌱" to "خذ لحظة تودّع فيها بيتك القديم. تستاهل." to ("New home, new start 🌱" to "Take a moment to say goodbye to the old place. It's worth it."),
    "تعرف إن الحجم أهم من الوزن؟" to "سعر النقل يعتمد كثيراً على حجم أغراضك ومساحتها في الشاحنة." to ("Volume matters more than weight" to "The price depends a lot on how much truck space your things take."),
)

@Composable
fun DailyLineCard(modifier: Modifier = Modifier) {
    val entry = DAILY[LocalDate.now().dayOfYear % DAILY.size]
    val (ar, en) = entry.first to entry.second
    val question = t(ar.first, en.first)
    val answer = t(ar.second, en.second)
    var shown by rememberSaveable { mutableStateOf(false) }
    val colors = MaterialTheme.colorScheme
    Surface(
        onClick = { shown = !shown },
        modifier = modifier.fillMaxWidth().animateContentSize(tween(250)),
        shape = MaterialTheme.shapes.large, color = colors.secondaryContainer.copy(alpha = 0.55f),
    ) {
        Row(Modifier.padding(16.dp).semantics { stateDescription = if (shown) answer else t("اضغط لترى الإجابة", "Tap to see the answer") },
            verticalAlignment = Alignment.Top) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Brand.Lime), Alignment.Center) {
                Icon(Icons.Outlined.Lightbulb, null, Modifier.size(22.dp), tint = Brand.Navy)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(t("لمسة اليوم", "Today's little tip"), style = MaterialTheme.typography.labelMedium, color = colors.primary)
                Text(question, style = MaterialTheme.typography.titleMedium)
                AnimatedVisibility(shown, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
                    Text(answer, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                }
                if (!shown) Text(t("اضغط لترى الجواب", "Tap for the answer"), style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant)
            }
        }
    }
}

// ---------- cancelling: why? ("other" is the second choice and opens a text box)

private val CANCEL_REASONS = listOf(
    "changed_plans" to { t("تغيّرت خططي", "My plans changed") },
    "other" to { t("سبب آخر", "Other reason") },
    "found_another_company" to { t("وجدت شركة أخرى", "I found another company") },
    "price_too_high" to { t("السعر أعلى من المتوقع", "The price is higher than I expected") },
    "wrong_date" to { t("الموعد غير مناسب", "The date doesn't suit me") },
    "booked_by_mistake" to { t("طلبت بالخطأ", "I booked by mistake") },
)

@Composable
fun CancelReasonDialog(onDismiss: () -> Unit, onCancel: (reason: String, note: String?) -> Unit) {
    var reason by rememberSaveable { mutableStateOf<String?>(null) }
    var note by rememberSaveable { mutableStateOf("") }
    val ready = reason != null && (reason != "other" || note.isNotBlank())
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Outlined.EventBusy, null) },
        title = { Text(t("ليش تبغى تلغي؟", "Why are you cancelling?")) },
        text = {
            Column(Modifier.selectableGroup().verticalScroll(rememberScrollState())) {
                Text(t("اختر سبباً يساعدنا نتحسّن. لا يمكن التراجع عن الإلغاء.", "Pick a reason to help us improve. Cancelling can't be undone."),
                    style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 8.dp))
                CANCEL_REASONS.forEach { (key, label) ->
                    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(MaterialTheme.shapes.small)
                        .selectable(reason == key, role = Role.RadioButton) { reason = key },
                        verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(reason == key, null)
                        Spacer(Modifier.width(12.dp))
                        Text(label(), style = MaterialTheme.typography.bodyLarge)
                    }
                    if (key == "other") AnimatedVisibility(reason == "other", enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
                        OutlinedTextField(note, { note = it.take(500) }, Modifier.fillMaxWidth().padding(bottom = 6.dp), shape = MaterialTheme.shapes.medium,
                            label = { Text(t("اكتب السبب", "Tell us why")) }, maxLines = 3)
                    }
                }
            }
        },
        confirmButton = {
            TextButton({ onCancel(reason!!, note.trim().takeIf { reason == "other" && it.isNotEmpty() }) }, enabled = ready) {
                Text(t("إلغاء الطلب", "Cancel the move"), color = if (ready) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f))
            }
        },
        dismissButton = { TextButton(onDismiss) { Text(t("رجوع", "Keep my move")) } },
    )
}

