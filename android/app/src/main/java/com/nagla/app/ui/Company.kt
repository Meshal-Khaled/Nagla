package com.nagla.app.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.nagla.app.data.Api
import com.nagla.app.data.MoveRow
import kotlinx.coroutines.launch

private fun companyScope(m: MoveRow) = when (m.current_stage) {
    "confirmed" -> "incoming"
    "completed", "rejected", "cancelled" -> "closed"
    else -> "active"
}

@Composable
fun CompanyHome(nav: NavHostController, bottom: @Composable () -> Unit) {
    val me = Session.me!!
    val loader = rememberLoader(pollMs = 15_000) { Api.companyMoves("all") }
    AppScreen(me.company_name ?: me.name, bottomBar = bottom) { pad ->
        RefreshList(loader, pad) { moves ->
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile(t("بانتظار القبول", "To accept"), moves.count { it.current_stage == "confirmed" }.toString(), Modifier.weight(1f), Icons.Outlined.Inbox) { nav.navigate("requests?scope=incoming") }
                    StatTile(t("بحاجة لفني", "Need a technician"), moves.count { it.current_stage == "accepted" }.toString(), Modifier.weight(1f), Icons.Outlined.PersonAdd) { nav.navigate("requests?scope=assign") }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile(t("قيد التنفيذ", "In progress"), moves.count { companyScope(it) == "active" }.toString(), Modifier.weight(1f), Icons.Outlined.LocalShipping) { nav.navigate("requests?scope=active") }
                    StatTile(t("منتهية", "Closed"), moves.count { companyScope(it) == "closed" }.toString(), Modifier.weight(1f), Icons.Outlined.TaskAlt) { nav.navigate("requests?scope=closed") }
                }
            }
            val waiting = moves.filter { it.current_stage == "confirmed" || it.current_stage == "accepted" }
            item { Text(t("بانتظار قرارك", "Waiting for you"), style = MaterialTheme.typography.titleLarge) }
            if (waiting.isEmpty()) item { EmptyState(t("لا شيء بانتظارك", "Nothing waiting for you"), icon = Icons.Outlined.Inbox) }
            items(waiting, key = { it.id }) { m -> MoveCard(m, { nav.navigate("move/${m.id}") }) }
        }
    }
}

@Composable
fun CompanyMoves(nav: NavHostController, bottom: @Composable () -> Unit, initial: String) {
    var scope by remember { mutableStateOf(initial) }
    val loader = rememberLoader(pollMs = 15_000) { Api.companyMoves("all") }
    AppScreen(t("طلبات النقل", "Moving requests"), bottomBar = bottom) { pad ->
        RefreshList(loader, pad) { all ->
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("all" to t("الكل", "All"), "incoming" to t("واردة", "Incoming"), "assign" to t("بحاجة لفني", "Need technician"),
                        "active" to t("جارية", "Active"), "closed" to t("منتهية", "Closed")).forEach { (k, label) -> FilterChip(scope == k, { scope = k }, { Text(label) }) }
                }
            }
            val list = all.filter { m ->
                when (scope) {
                    "assign" -> m.current_stage == "accepted"
                    "all" -> true
                    else -> companyScope(m) == scope
                }
            }
            if (list.isEmpty()) item { EmptyState(t("لا توجد طلبات هنا", "No moves here")) }
            items(list, key = { it.id }) { m -> MoveCard(m, { nav.navigate("move/${m.id}") }) }
        }
    }
}

@Composable
fun TeamScreen(nav: NavHostController, bottom: @Composable () -> Unit) {
    val loader = rememberLoader { Api.agents() }
    var add by remember { mutableStateOf(false) }
    AppScreen(t("الفنيون", "Technicians"), bottomBar = bottom, actions = {
        IconButton({ add = true }) { Icon(Icons.Outlined.PersonAdd, t("إضافة فني", "Add technician")) }
    }) { pad ->
        RefreshList(loader, pad) { agents ->
            if (agents.isEmpty()) item { EmptyState(t("لا يوجد فنيون بعد", "No technicians yet"), icon = Icons.Outlined.Groups) }
            items(agents, key = { it.id }) { a ->
                SectionCard {
                    ListItem(headlineContent = { Text(a.name) }, supportingContent = { Text(a.email) }, leadingContent = { Icon(Icons.Outlined.Engineering, null) })
                }
            }
        }
    }
    if (add) {
        var name by remember { mutableStateOf("") }
        var email by remember { mutableStateOf("") }
        var pw by remember { mutableStateOf("") }
        var error by remember { mutableStateOf<String?>(null) }
        var busy by remember { mutableStateOf(false) }
        val scope = rememberCoroutineScope()
        AlertDialog(onDismissRequest = { add = false }, title = { Text(t("إضافة فني", "Add a technician")) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(name, { name = it }, label = { Text(t("الاسم", "Name")) }, singleLine = true)
                    OutlinedTextField(email, { email = it }, label = { Text(t("البريد الإلكتروني", "Email")) }, singleLine = true)
                    OutlinedTextField(pw, { pw = it }, label = { Text(t("كلمة مرور مؤقتة (٨+)", "Temporary password (8+)")) }, singleLine = true)
                    ErrorNote(error)
                }
            },
            confirmButton = {
                TextButton({
                    busy = true
                    scope.launch {
                        try { Api.addAgent(name.trim(), email.trim(), pw); add = false; loader.reload(true) } catch (e: Exception) { error = errorText(e) } finally { busy = false }
                    }
                }, enabled = !busy && name.isNotBlank() && email.isNotBlank() && pw.length >= 8) { Text(t("إضافة", "Add")) }
            },
            dismissButton = { TextButton({ add = false }) { Text(t("إلغاء", "Cancel")) } })
    }
}
