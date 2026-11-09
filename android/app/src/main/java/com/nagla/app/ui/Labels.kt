package com.nagla.app.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.ui.graphics.vector.ImageVector

val MAIN_STAGES = listOf(
    "confirmed", "accepted", "crew_assigned", "on_the_way", "arrived_pickup",
    "loading", "loaded", "in_transit", "arrived_destination", "unloading", "completed",
)
val TECH_STAGES = MAIN_STAGES.drop(3)
val END_STAGES = setOf("completed", "rejected", "cancelled")

fun stageName(s: String?): String = when (s) {
    "draft" -> t("مسودة", "Draft")
    "confirmed" -> t("بانتظار قبول الشركة", "Waiting for the company")
    "accepted" -> t("قبلت الشركة الطلب", "Accepted by the company")
    "crew_assigned" -> t("تم تعيين الفني", "Technician assigned")
    "on_the_way" -> t("الفريق في الطريق إليك", "Crew on the way")
    "arrived_pickup" -> t("وصل الفريق للاستلام", "At pickup")
    "loading" -> t("جارٍ التحميل", "Loading")
    "loaded" -> t("تم التحميل", "Loaded")
    "in_transit" -> t("في الطريق للوجهة", "In transit")
    "arrived_destination" -> t("وصل الفريق للوجهة", "At destination")
    "unloading" -> t("جارٍ التفريغ", "Unloading")
    "completed" -> t("مكتمل", "Completed")
    "rejected" -> t("رفضت الشركة الطلب", "Rejected by the company")
    "cancelled" -> t("ملغى", "Cancelled")
    else -> s ?: "—"
}

/** what the technician taps to move to a stage */
fun techAction(s: String): String = when (s) {
    "on_the_way" -> t("انطلقت إلى العميل", "Start driving")
    "arrived_pickup" -> t("وصلت للاستلام", "Arrived at pickup")
    "loading" -> t("بدء التحميل", "Start loading")
    "loaded" -> t("تم التحميل", "Loaded")
    "in_transit" -> t("بدء الرحلة", "Start transit")
    "arrived_destination" -> t("وصلت للوجهة", "Arrived at delivery")
    "unloading" -> t("بدء التفريغ", "Start unloading")
    "completed" -> t("تم التسليم", "Complete the move")
    else -> stageName(s)
}

fun stageIcon(s: String?): ImageVector = when (s) {
    "draft" -> Icons.Outlined.EditNote
    "confirmed" -> Icons.Outlined.HourglassTop
    "accepted" -> Icons.Outlined.Verified
    "crew_assigned" -> Icons.Outlined.Engineering
    "on_the_way" -> Icons.Outlined.LocalShipping
    "arrived_pickup" -> Icons.Outlined.Home
    "loading" -> Icons.Outlined.Inventory2
    "loaded" -> Icons.Outlined.Inventory
    "in_transit" -> Icons.Outlined.AltRoute
    "arrived_destination" -> Icons.Outlined.Place
    "unloading" -> Icons.Outlined.Download
    "completed" -> Icons.Outlined.TaskAlt
    "rejected", "cancelled" -> Icons.Outlined.Block
    else -> Icons.Outlined.Circle
}

fun dispositionName(d: String) = when (d) {
    "keep" -> t("نقل", "Move")
    "sell" -> t("بيع", "Sell")
    "donate" -> t("تبرع", "Donate")
    else -> d
}

fun roleName(r: String?) = when (r) {
    "customer" -> t("العميل", "Customer")
    "company_admin" -> t("شركة النقل", "Moving company")
    "agent" -> t("الفني", "Technician")
    "system" -> t("النظام", "System")
    else -> r ?: ""
}

fun serviceName(s: String) = when (s) {
    "moving" -> t("نقل", "Moving")
    "disassembly" -> t("فك", "Disassembly")
    "assembly" -> t("تركيب", "Assembly")
    "fragile_packing" -> t("تغليف القطع القابلة للكسر", "Fragile packing")
    else -> s
}

val ROOMS = listOf(
    "living_room" to ("غرفة المعيشة" to "Living room"),
    "majlis" to ("المجلس" to "Majlis"),
    "bedroom_1" to ("غرفة النوم ١" to "Bedroom 1"),
    "bedroom_2" to ("غرفة النوم ٢" to "Bedroom 2"),
    "bedroom_3" to ("غرفة النوم ٣" to "Bedroom 3"),
    "kitchen" to ("المطبخ" to "Kitchen"),
    "dining_room" to ("غرفة الطعام" to "Dining room"),
    "office" to ("المكتب" to "Office"),
    "storage" to ("المخزن" to "Storage"),
    "bathroom" to ("دورة المياه" to "Bathroom"),
    "kids_room" to ("غرفة الأطفال" to "Kids' room"),
    "laundry" to ("غرفة الغسيل" to "Laundry"),
    "outdoor" to ("الحوش والسطح" to "Yard & roof"),
)
fun roomName(k: String) = ROOMS.firstOrNull { it.first == k }?.second?.let { t(it.first, it.second) } ?: k.replace('_', ' ')

/** badge colour group */
enum class Group { Pending, Active, Done, Off }
fun groupOf(status: String, stage: String?): Group = when {
    status == "draft" || stage == null || stage == "confirmed" -> Group.Pending
    stage == "completed" -> Group.Done
    stage == "rejected" || stage == "cancelled" -> Group.Off
    else -> Group.Active
}

fun sar(halalas: Long): String {
    val v = halalas / 100.0
    val s = if (v % 1.0 == 0.0) v.toLong().toString() else String.format(java.util.Locale.US, "%.2f", v)
    return t("$s ر.س", "SAR $s")
}

fun dateText(iso: String?): String {
    if (iso.isNullOrBlank()) return "—"
    return runCatching {
        val d = java.time.LocalDate.parse(iso.take(10))
        val loc = if (com.nagla.app.data.Prefs.lang == "ar") java.util.Locale("ar") else java.util.Locale.ENGLISH
        d.format(java.time.format.DateTimeFormatter.ofPattern("EEE d MMM yyyy", loc))
    }.getOrDefault(iso)
}

fun dateTimeText(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    return runCatching {
        val i = java.time.OffsetDateTime.parse(iso).atZoneSameInstant(java.time.ZoneId.systemDefault())
        val loc = if (com.nagla.app.data.Prefs.lang == "ar") java.util.Locale("ar") else java.util.Locale.ENGLISH
        i.format(java.time.format.DateTimeFormatter.ofPattern("d MMM", loc)) + "، " + time12("%02d:%02d".format(java.util.Locale.US, i.hour, i.minute))
    }.getOrDefault(iso)
}

fun dateLine(from: String?, to: String?, time: String?): String =
    (if (from == null) t("لم يُحدد الموعد", "No date yet") else dateText(from)) +
        (if (to != null && to != from) " – " + dateText(to) else "") +
        (if (!time.isNullOrBlank()) " · " + time12(time) else "")

/** "15:30" → "3:30 PM" / "3:30 م" (12-hour clock everywhere in the app) */
fun time12(hhmm: String): String {
    val h = hhmm.take(2).toIntOrNull() ?: return hhmm
    val m = hhmm.drop(3).take(2).toIntOrNull() ?: 0
    val am = h < 12
    val h12 = if (h % 12 == 0) 12 else h % 12
    return String.format(java.util.Locale.US, "%d:%02d\u00A0", h12, m) + if (am) t("ص", "AM") else t("م", "PM")
}

fun errorText(e: Throwable): String {
    val code = (e as? com.nagla.app.data.ApiException)?.code
    return when (code) {
        "network" -> t("تعذر الاتصال بالخادم. تحقق من الإنترنت.", "Can't reach the server. Check your connection.")
        "unauthorized" -> t("البريد أو كلمة المرور غير صحيحة.", "Wrong email or password.")
        "email_taken" -> t("البريد مسجل بالفعل.", "That email is already registered.")
        "validation" -> t("تحقق من البيانات المدخلة.", "Check the details you entered.")
        "not_draft" -> t("تم تأكيد الطلب بالفعل.", "This request is already confirmed.")
        "no_photos" -> t("أضف صور الغرف أولاً.", "Add room photos first.")
        "too_late_to_cancel" -> t("لا يمكن الإلغاء بعد انطلاق الفريق.", "You can't cancel once the crew is on the way.")
        "backward_stage" -> t("لا يمكن الرجوع لمرحلة سابقة.", "You can't go back to an earlier stage.")
        "not_accepted" -> t("اقبل الطلب قبل تعيين فني.", "Accept the move before assigning a technician.")
        "already_rated" -> t("تم التقييم مسبقاً.", "Already rated.")
        "move_running" -> t("لا يمكن أرشفة نقل جارٍ.", "An active move can't be archived.")
        "geo_not_configured" -> t("خدمة الخرائط غير مفعلة بعد.", "Maps search isn't set up yet.")
        "invalid_google_token" -> t("تعذر التحقق من حساب Google.", "Google sign-in could not be verified.")
        else -> e.message?.takeIf { it.isNotBlank() && it != code } ?: t("حدث خطأ. حاول مجدداً.", "Something went wrong. Try again.")
    }
}

/** truck size names from the API ("small" …) in the app's language */
fun truckName(name: String?): String = when (name) {
    "small" -> t("صغيرة", "Small"); "medium" -> t("متوسطة", "Medium"); "large" -> t("كبيرة", "Large")
    null -> ""; else -> name
}

/** "1 trip" / "2 trips" */
fun tripsText(n: Int): String = if (n == 1) t("رحلة واحدة", "1 trip") else t("$n رحلات", "$n trips")
