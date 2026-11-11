package com.nagla.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.nagla.app.data.Api
import com.nagla.app.data.GoogleSignupProfile
import kotlinx.coroutines.launch

/** "+966 5x xxx xxxx", "05x…", "5x…" → digits with an optional leading + (what the API accepts) */
private fun cleanPhone(raw: String): String = raw.trim().replace(Regex("[^0-9+ ]"), "")
private fun phoneOk(raw: String) = Regex("^\\+?[0-9 ]{7,20}$").matches(cleanPhone(raw)) && cleanPhone(raw).count { it.isDigit() } >= 7

private fun genderName(g: String?) = when (g) { "male" -> t("ذكر", "Male"); "female" -> t("أنثى", "Female"); else -> "—" }

/**
 * After a first Google sign-in, before the account exists: name (from Google, editable), phone and gender,
 * then a summary of everything that can still be edited. "Create account" makes the account and signs in.
 */
@Composable
fun GoogleSignupScreen(signupToken: String, profile: GoogleSignupProfile, onCancel: () -> Unit) {
    var name by rememberSaveable { mutableStateOf(profile.name) }
    var phone by rememberSaveable { mutableStateOf("") }
    var gender by rememberSaveable { mutableStateOf<String?>(null) }
    var review by rememberSaveable { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val formOk = name.isNotBlank() && phoneOk(phone) && gender != null

    BackHandler { if (review) review = false else onCancel() }

    fun create() {
        if (busy) return
        busy = true; error = null
        scope.launch {
            try { signIn(Api.googleComplete(signupToken, name.trim(), cleanPhone(phone), gender!!)) }
            catch (e: Exception) { error = errorText(e) }
            finally { busy = false }
        }
    }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize().safeDrawingPadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton({ if (review) review = false else onCancel() }) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, t("رجوع", "Back"))
                }
                Text(if (review) t("راجع معلوماتك", "Check your details") else t("خطوة أخيرة", "One last step"),
                    style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
            }
            AnimatedContent(review, Modifier.weight(1f), transitionSpec = {
                val dir = if (targetState) AnimatedContentTransitionScope.SlideDirection.Start else AnimatedContentTransitionScope.SlideDirection.End
                (fadeIn(tween(220)) + slideIntoContainer(dir, tween(280)) { it / 6 }) togetherWith fadeOut(tween(150))
            }, label = "signup") { showReview ->
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    if (!showReview) {
                        Text(t("أكمل معلوماتك لإنشاء حسابك في نقلة.", "Complete your details to create your Naqla account."),
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        OutlinedTextField(profile.email, {}, Modifier.fillMaxWidth(), enabled = false, singleLine = true, shape = MaterialTheme.shapes.medium,
                            label = { Text(t("البريد الإلكتروني (من Google)", "Email (from Google)")) }, leadingIcon = { Icon(Icons.Outlined.Email, null) })
                        OutlinedTextField(name, { name = it.take(100) }, Modifier.fillMaxWidth(), singleLine = true, shape = MaterialTheme.shapes.medium,
                            label = { Text(t("الاسم", "Name")) }, leadingIcon = { Icon(Icons.Outlined.Person, null) },
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next))
                        val phoneError = phone.isNotBlank() && !phoneOk(phone)
                        OutlinedTextField(phone, { phone = it.take(20) }, Modifier.fillMaxWidth(), singleLine = true, shape = MaterialTheme.shapes.medium,
                            label = { Text(t("رقم الجوال", "Phone number")) }, placeholder = { Text("05x xxx xxxx") },
                            leadingIcon = { Icon(Icons.Outlined.Phone, null) }, isError = phoneError,
                            supportingText = { Text(if (phoneError) t("اكتب رقم جوال صحيح.", "Enter a valid phone number.") else t("تتواصل معك شركة النقل عليه.", "The moving company contacts you on it.")) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Done))
                        Text(t("الجنس", "Gender"), style = MaterialTheme.typography.titleSmall)
                        Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            GenderOption(t("ذكر", "Male"), Icons.Outlined.Man, gender == "male", Modifier.weight(1f)) { gender = "male" }
                            GenderOption(t("أنثى", "Female"), Icons.Outlined.Woman, gender == "female", Modifier.weight(1f)) { gender = "female" }
                        }
                    } else {
                        Text(t("تأكد أن كل شيء صحيح. تقدر تعدّل أي معلومة قبل إنشاء الحساب.", "Make sure everything is right. You can edit anything before the account is made."),
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        SectionCard {
                            SummaryRow(Icons.Outlined.Person, t("الاسم", "Name"), name.trim()) { review = false }
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                            SummaryRow(Icons.Outlined.Email, t("البريد الإلكتروني", "Email"), profile.email, onEdit = null)
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                            SummaryRow(Icons.Outlined.Phone, t("رقم الجوال", "Phone number"), cleanPhone(phone)) { review = false }
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                            SummaryRow(if (gender == "female") Icons.Outlined.Woman else Icons.Outlined.Man, t("الجنس", "Gender"), genderName(gender)) { review = false }
                        }
                        InfoBanner(Icons.Outlined.Lock) {
                            Text(t("بريدك يأتي من حساب Google ولا يتغير هنا.", "Your email comes from your Google account and can't be changed here."),
                                style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    ErrorNote(error)
                }
            }
            Surface(shadowElevation = 8.dp, color = MaterialTheme.colorScheme.surface) {
                Box(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp)) {
                    if (!review) PrimaryButton(t("التالي: مراجعة المعلومات", "Next: check your details"), { review = true }, Modifier.fillMaxWidth(),
                        enabled = formOk, icon = Icons.Outlined.FactCheck)
                    else PrimaryButton(t("إنشاء الحساب", "Create account"), ::create, Modifier.fillMaxWidth(), enabled = formOk, busy = busy,
                        icon = Icons.Outlined.Check)
                }
            }
        }
    }
}

@Composable
private fun GenderOption(label: String, icon: ImageVector, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Surface(
        modifier.heightIn(min = 64.dp).selectable(selected, role = Role.RadioButton, onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        color = if (selected) colors.primaryContainer else colors.surface,
        border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) colors.primary else colors.outlineVariant),
    ) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
            Icon(icon, null, tint = if (selected) colors.primary else colors.onSurfaceVariant)
            Spacer(Modifier.width(8.dp))
            Text(label, style = MaterialTheme.typography.titleMedium, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal)
            if (selected) { Spacer(Modifier.width(6.dp)); Icon(Icons.Outlined.CheckCircle, null, Modifier.size(18.dp), tint = colors.primary) }
        }
    }
}

@Composable
private fun SummaryRow(icon: ImageVector, label: String, value: String, onEdit: (() -> Unit)?) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.bodyLarge)
        }
        if (onEdit != null) IconButton(onEdit) { Icon(Icons.Outlined.Edit, t("تعديل $label", "Edit $label")) }
    }
}
