package com.nagla.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.AssignmentTurnedIn
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.PeopleOutline
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.nagla.app.R

@Composable
internal fun NaqlaIconTile(icon: ImageVector, size: Int = 44, completed: Boolean = false) {
    val colors = MaterialTheme.colorScheme
    Surface(
        modifier = Modifier.size(size.dp),
        shape = RoundedCornerShape((size * 0.3f).dp),
        color = if (completed) Brand.Lime else colors.primaryContainer,
        contentColor = if (completed) Brand.Navy else colors.onPrimaryContainer,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, modifier = Modifier.size((size * 0.52f).dp))
        }
    }
}

@Composable
internal fun NaqlaWelcomeIntro() {
    val colors = MaterialTheme.colorScheme
    Surface(shape = CircleShape, color = colors.primaryContainer, contentColor = colors.onPrimaryContainer) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Icon(Icons.Outlined.LocationOn, null, Modifier.size(15.dp))
            Text(t("بداية جديدة، بنقلة أسهل", "A new beginning. An easier move."), style = MaterialTheme.typography.labelMedium)
        }
    }
    Text(
        buildAnnotatedString {
            append(t("نقل عفشك صار ", "Your next move, "))
            withStyle(SpanStyle(color = colors.primary)) { append(t("أسهل", "made easier.")) }
            append(t(" مع نقلة", ""))
        },
        modifier = Modifier.semantics { heading() },
        style = MaterialTheme.typography.displaySmall,
    )
    Surface(
        modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), color = colors.surface,
        border = BorderStroke(1.dp, colors.outlineVariant),
    ) {
        Column {
            Image(
                painterResource(R.drawable.naqla_moving_truck),
                t("شاحنة نقل أمام منزل في الرياض", "Moving truck outside a Riyadh home"),
                Modifier.fillMaxWidth().aspectRatio(2.75f),
                contentScale = ContentScale.Crop,
            )
            Row(Modifier.padding(horizontal = 12.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                NaqlaIconTile(Icons.Outlined.Home, size = 32)
                Text(t("من بيتك… لبيتك الجديد", "From your home… to your next"), Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.size(18.dp), tint = colors.primary)
            }
        }
    }
}

private data class MoveMilestone(val stage: String, val ar: String, val en: String, val icon: ImageVector)

private val MoveMilestones = listOf(
    MoveMilestone("confirmed", "الحجز", "Booked", Icons.Outlined.AssignmentTurnedIn),
    MoveMilestone("crew_assigned", "الفريق", "Crew", Icons.Outlined.PeopleOutline),
    MoveMilestone("in_transit", "في الطريق", "On the road", Icons.Outlined.LocalShipping),
    MoveMilestone("completed", "الاكتمال", "Done", Icons.Outlined.TaskAlt),
)

@Composable
internal fun CustomerTrackingSummary(stage: String?, percent: Int, updated: String?, company: String?) {
    val colors = MaterialTheme.colorScheme
    val current = MAIN_STAGES.indexOf(stage)
    val completed = stage == "completed"
    SectionCard {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp)) {
            NaqlaIconTile(if (completed) Icons.Outlined.Check else Icons.Outlined.LocalShipping, size = 76, completed = completed)
            Text(t("المرحلة الحالية", "Current stage"), style = MaterialTheme.typography.labelMedium, color = colors.primary)
            Text(stageName(stage), Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
            company?.let {
                Text(t("شركة النقل: ", "Moving company: ") + it, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
            }
            updated?.let {
                Text(t("آخر تحديث ", "Updated ") + it, style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
            }
        }
        LinearProgressIndicator(
            progress = { (percent / 100f).coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth().height(6.dp), color = colors.primary, trackColor = colors.surfaceVariant,
        )
        Text(t("تقدّم المراحل ", "Progress ") + "$percent%", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            MoveMilestones.forEach { milestone ->
                val reached = current >= MAIN_STAGES.indexOf(milestone.stage)
                val state = if (reached) t("تمت", "Reached") else t("قادمة", "Upcoming")
                Column(Modifier.weight(1f).semantics(mergeDescendants = true) { stateDescription = state },
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Surface(
                        modifier = Modifier.size(36.dp), shape = CircleShape,
                        color = if (reached) colors.primaryContainer else colors.surface,
                        border = BorderStroke(1.dp, if (reached) colors.primary else colors.outlineVariant),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(if (reached) Icons.Outlined.Check else milestone.icon, null, Modifier.size(17.dp),
                                tint = if (reached) colors.primary else colors.onSurfaceVariant)
                        }
                    }
                    Text(t(milestone.ar, milestone.en), style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center)
                }
            }
        }
    }
}
