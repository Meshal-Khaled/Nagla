package com.nagla.app.ui

import android.app.Activity
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.nagla.app.R
import com.nagla.app.data.Api
import com.nagla.app.data.Prefs
import com.nagla.app.data.Tokens
import kotlinx.coroutines.launch

suspend fun signIn(tokens: Tokens) {
    Prefs.access = tokens.access_token
    Prefs.refresh = tokens.refresh_token
    Session.me = Api.me()
}

/**
 * One sign-in for everyone: the account decides the role (company and technician accounts are made in advance,
 * so they are never offered here). Customers can register; Google is the second option (native SDK).
 */
@Composable
fun AuthScreen() {
    var register by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var showPw by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var google by remember { mutableStateOf<String?>(null) } // web client id when Google is on
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    // whether Google is on comes from the server; retry a few times (the network may still be waking up)
    LaunchedEffect(Unit) {
        repeat(5) { attempt ->
            val s = runCatching { Api.googleStatus() }.onFailure { android.util.Log.w("Naqla", "google status: $it") }.getOrNull()
            if (s != null) { google = s.client_id.takeIf { s.native }; return@LaunchedEffect }
            kotlinx.coroutines.delay(1500L * (attempt + 1))
        }
    }

    fun submit() {
        if (busy) return
        busy = true; error = null
        scope.launch {
            try {
                signIn(if (register) Api.register(name.trim(), email.trim(), password) else Api.login(email.trim(), password))
            } catch (e: Exception) {
                error = errorText(e)
            } finally { busy = false }
        }
    }

    fun googleSignIn(clientId: String) {
        busy = true; error = null
        scope.launch {
            try {
                val option = GetSignInWithGoogleOption.Builder(clientId).build()
                val result = CredentialManager.create(context).getCredential(context as Activity, GetCredentialRequest.Builder().addCredentialOption(option).build())
                val c = result.credential
                if (c is CustomCredential && c.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                    signIn(Api.googleNative(GoogleIdTokenCredential.createFrom(c.data).idToken))
                } else error = t("تعذر تسجيل الدخول بـ Google.", "Google sign-in failed.")
            } catch (_: GetCredentialCancellationException) {
            } catch (e: Exception) {
                error = errorText(e)
            } finally { busy = false }
        }
    }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).systemBarsPadding().imePadding().padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // the lockup has the sheet's light background: give it a matching card so it looks right in dark mode too
            Surface(color = Brand.Splash, shape = MaterialTheme.shapes.large, modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 16.dp)) {
                Image(painterResource(R.drawable.logo_lockup), "نقلة Naqla", Modifier.width(220.dp).padding(horizontal = 14.dp, vertical = 8.dp))
            }
            Text(
                if (register) t("إنشاء حساب", "Create an account") else t("أهلاً بعودتك", "Welcome back"),
                style = MaterialTheme.typography.headlineMedium,
            )
            if (register) OutlinedTextField(name, { name = it }, label = { Text(t("الاسم", "Name")) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                leadingIcon = { Icon(Icons.Outlined.Person, null) })
            OutlinedTextField(email, { email = it }, label = { Text(t("البريد الإلكتروني", "Email")) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                leadingIcon = { Icon(Icons.Outlined.Email, null) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next))
            OutlinedTextField(password, { password = it }, label = { Text(t("كلمة المرور", "Password")) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                leadingIcon = { Icon(Icons.Outlined.Lock, null) },
                trailingIcon = { IconButton({ showPw = !showPw }) { Icon(if (showPw) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, null) } },
                visualTransformation = if (showPw) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = if (register) ImeAction.Next else ImeAction.Done),
                supportingText = if (register) ({ Text(t("٨ أحرف على الأقل", "At least 8 characters")) }) else null)
            val mismatch = register && confirm.isNotEmpty() && confirm != password
            if (register) OutlinedTextField(confirm, { confirm = it }, label = { Text(t("تأكيد كلمة المرور", "Confirm password")) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                leadingIcon = { Icon(Icons.Outlined.Lock, null) },
                visualTransformation = if (showPw) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                isError = mismatch,
                supportingText = if (mismatch) ({ Text(t("كلمتا المرور غير متطابقتين", "The passwords don't match")) }) else null)
            ErrorNote(error)
            PrimaryButton(
                if (register) t("إنشاء الحساب", "Create account") else t("تسجيل الدخول", "Sign in"), ::submit, Modifier.fillMaxWidth(),
                enabled = email.isNotBlank() && password.isNotEmpty() && (!register || (name.isNotBlank() && password.length >= 8 && confirm == password)), busy = busy,
            )
            run {
                TextButton({ register = !register; error = null; confirm = "" }, Modifier.align(Alignment.CenterHorizontally)) {
                    Text(if (register) t("لدي حساب", "I have an account") else t("إنشاء حساب جديد", "Create an account"))
                }
                google?.let { clientId ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        HorizontalDivider(Modifier.weight(1f)); Text("  " + t("أو", "or") + "  ", color = MaterialTheme.colorScheme.onSurfaceVariant); HorizontalDivider(Modifier.weight(1f))
                    }
                    OutlinedButton({ googleSignIn(clientId) }, Modifier.fillMaxWidth().heightIn(min = 52.dp), enabled = !busy) {
                        Text("G  ", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                        Text(t("المتابعة باستخدام Google", "Continue with Google"))
                    }
                }
            }
        }
    }
}
