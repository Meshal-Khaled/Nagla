package com.nagla.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.nagla.app.data.Api
import kotlinx.coroutines.launch

/** customer ↔ company / technician chat, refreshed every 4 s without redrawing old messages */
@Composable
fun ChatScreen(nav: NavHostController, moveId: String) {
    val me = Session.me!!
    val loader = rememberLoader(moveId, pollMs = 4_000) { Api.messages(moveId) }
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val list = rememberLazyListState()
    val messages = loader.data.orEmpty()
    LaunchedEffect(messages.size) { if (messages.isNotEmpty()) list.animateScrollToItem(messages.size - 1) }

    AppScreen(t("المحادثة", "Chat"), onBack = { nav.popBackStack() }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().imePadding()) {
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = list, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (messages.isEmpty() && !loader.loading) item {
                    EmptyState(t("ابدأ المحادثة", "Start the conversation"), t("الرسائل تصل للعميل والشركة والفني المعيّن.", "Messages reach the customer, the company and the assigned technician."))
                }
                items(messages, key = { it.id }) { m ->
                    val mine = m.sender_id == me.id
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                        Column(
                            Modifier.widthIn(max = 300.dp).clip(RoundedCornerShape(18.dp))
                                .background(if (mine) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface)
                                .padding(horizontal = 14.dp, vertical = 8.dp),
                        ) {
                            if (!mine) Text((m.sender_name ?: "") + " · " + roleName(m.sender_role), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                            Text(m.body, style = MaterialTheme.typography.bodyLarge)
                            Text(dateTimeText(m.created_at), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.align(Alignment.End))
                        }
                    }
                }
            }
            ErrorNote(error ?: loader.error)
            Surface(tonalElevation = 3.dp) {
                Row(Modifier.fillMaxWidth().padding(10.dp).navigationBarsPadding(), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(text, { text = it.take(2000) }, Modifier.weight(1f), placeholder = { Text(t("اكتب رسالة", "Write a message")) }, maxLines = 4)
                    Spacer(Modifier.width(8.dp))
                    FilledIconButton(
                        onClick = {
                            val body = text.trim(); if (body.isEmpty()) return@FilledIconButton
                            sending = true; error = null
                            scope.launch {
                                try { Api.sendMessage(moveId, body); text = ""; loader.reload(true) } catch (e: Exception) { error = errorText(e) } finally { sending = false }
                            }
                        },
                        enabled = !sending && text.isNotBlank(), modifier = Modifier.size(52.dp),
                    ) { Icon(Icons.AutoMirrored.Outlined.Send, t("إرسال", "Send")) }
                }
            }
        }
    }
}
