package com.nagla.app.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.nagla.app.data.Api
import com.nagla.app.data.Prefs

@Composable
fun NaqlaRoot() {
    var splash by remember { mutableStateOf(true) }
    var checked by remember { mutableStateOf(false) }
    // who is signed in is checked while the splash plays
    LaunchedEffect(Unit) {
        if (Prefs.access != null || Prefs.refresh != null) Session.me = runCatching { Api.me() }.getOrNull()
        checked = true
    }
    NaqlaTheme {
        AnimatedContent(targetState = splash || !checked, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "root") { showSplash ->
            if (showSplash) NaqlaSplash { splash = false }
            else {
                val me = Session.me
                if (me == null) AuthScreen() else key(me.id) { RoleShell(me.role) }
            }
        }
    }
}

private data class Tab(val route: String, val icon: ImageVector, val label: () -> String)

private fun tabsFor(role: String): List<Tab> = when (role) {
    "company_admin" -> listOf(
        Tab("home", Icons.Outlined.GridView) { t("الرئيسية", "Home") },
        Tab("requests", Icons.Outlined.Assignment) { t("الطلبات", "Moves") },
        Tab("team", Icons.Outlined.Groups) { t("الفنيون", "Technicians") },
        Tab("profile", Icons.Outlined.Person) { t("الملف", "Profile") },
    )
    "agent" -> listOf(
        Tab("home", Icons.Outlined.GridView) { t("الرئيسية", "Home") },
        Tab("tasks", Icons.Outlined.WorkOutline) { t("المهام", "Tasks") },
        Tab("profile", Icons.Outlined.Person) { t("الملف", "Profile") },
    )
    else -> listOf(
        Tab("home", Icons.Outlined.GridView) { t("الرئيسية", "Home") },
        Tab("moves", Icons.Outlined.ListAlt) { t("طلباتي", "My moves") },
        Tab("book", Icons.Outlined.AddCircleOutline) { t("طلب جديد", "New move") },
        Tab("profile", Icons.Outlined.Person) { t("الملف", "Profile") },
    )
}

@Composable
fun BottomBar(nav: NavHostController, role: String) {
    val current = nav.currentBackStackEntryAsState().value?.destination?.route?.substringBefore('?')
    val tabs = tabsFor(role)
    if (tabs.none { it.route == current }) return
    NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
        tabs.forEach { tab ->
            NavigationBarItem(
                selected = current == tab.route,
                onClick = {
                    if (current != tab.route) nav.navigate(tab.route) {
                        popUpTo("home") { saveState = true }
                        launchSingleTop = true
                        restoreState = tab.route != "book"
                    }
                },
                icon = { Icon(tab.icon, null) },
                label = { Text(tab.label(), maxLines = 1) },
            )
        }
    }
}

@Composable
fun RoleShell(role: String) {
    val nav = rememberNavController()
    val bottom: @Composable () -> Unit = { BottomBar(nav, role) }
    NavHost(nav, startDestination = "home", modifier = Modifier.fillMaxSize()) {
        // shared
        composable("profile") { ProfileScreen(nav, bottom) }
        composable("settings") { SettingsScreen(nav) }
        composable("addresses") { AddressesScreen(nav) }
        composable("password") { PasswordScreen(nav) }
        composable("account") { AccountScreen(nav) }
        composable("chat/{id}") { ChatScreen(nav, it.arguments!!.getString("id")!!) }
        when (role) {
            "company_admin" -> {
                composable("home") { CompanyHome(nav, bottom) }
                composable("requests?scope={scope}", listOf(navArgument("scope") { type = NavType.StringType; defaultValue = "all" })) {
                    CompanyMoves(nav, bottom, it.arguments?.getString("scope") ?: "all")
                }
                composable("team") { TeamScreen(nav, bottom) }
                composable("move/{id}") { MoveDetailScreen(nav, it.arguments!!.getString("id")!!) }
            }
            "agent" -> {
                composable("home") { TechHome(nav, bottom) }
                composable("tasks") { TechTasks(nav, bottom) }
                composable("task/{id}") { TaskScreen(nav, it.arguments!!.getString("id")!!) }
            }
            else -> {
                composable("home") { CustomerHome(nav, bottom) }
                composable("moves") { CustomerMoves(nav, bottom) }
                composable("archive") { ArchiveScreen(nav) }
                composable("book") { BookingScreen(nav, null) }
                composable("book/{id}") { BookingScreen(nav, it.arguments!!.getString("id")) }
                composable("move/{id}") { MoveDetailScreen(nav, it.arguments!!.getString("id")!!) }
            }
        }
    }
}
