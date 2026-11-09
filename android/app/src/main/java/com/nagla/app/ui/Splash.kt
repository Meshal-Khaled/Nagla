package com.nagla.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nagla.app.R

private const val DURATION = 4600L

private fun clamp(x: Float) = x.coerceIn(0f, 1f)
private fun ease(x: Float) = clamp(x).let { it * it * (3 - 2 * it) }

/**
 * The Naqla splash (from the "Naqla Splash" design): the original lockup, uniformly scaled, never moved.
 * 0–550 ms the N/box mark fades in, 650–1500 ms the wordmarks, 1700–2400 ms the tagline,
 * hold, then fade out by 4600 ms. Tap to skip.
 */
@Composable
fun NaqlaSplash(onDone: () -> Unit) {
    var time by remember { mutableLongStateOf(0L) }
    var skipped by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        val start = withFrameMillis { it }
        while (time < DURATION && !skipped) {
            time = withFrameMillis { it } - start
        }
        onDone()
    }
    val tm = time.toFloat()
    val painter = painterResource(R.drawable.logo_lockup)
    Box(
        Modifier.fillMaxSize().background(Brand.Splash)
            .graphicsLayer { alpha = 1f - ease((tm - 4250f) / 350f) }
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { skipped = true },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(24.dp)) {
            Box(Modifier.fillMaxWidth().widthIn(max = 480.dp).aspectRatio(960f / 448f)) {
                // the mark: left 45 % of the lockup
                Image(painter, null, contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize().graphicsLayer { alpha = ease(tm / 550f) }
                        .drawWithContent { clipRect(right = size.width * 0.45f) { this@drawWithContent.drawContent() } })
                // the wordmarks: right 55 %
                Image(painter, null, contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize().graphicsLayer { alpha = ease((tm - 650f) / 850f) }
                        .drawWithContent { clipRect(left = size.width * 0.45f) { this@drawWithContent.drawContent() } })
            }
            Spacer(Modifier.height(27.dp))
            Text(
                "من أول قرار، لين تستقر في الدار.",
                style = TextStyle(fontSize = 17.sp, color = Brand.Navy, textAlign = TextAlign.Center, textDirection = TextDirection.Rtl, lineHeight = 30.sp),
                modifier = Modifier.graphicsLayer {
                    alpha = ease((tm - 1700f) / 700f)
                    translationY = (1f - ease((tm - 1700f) / 700f)) * 6.dp.toPx()
                },
            )
        }
        Box(
            Modifier.align(Alignment.BottomCenter).padding(bottom = 56.dp).size(32.dp, 3.dp).clip(RoundedCornerShape(2.dp))
                .graphicsLayer { alpha = (1f - ease((tm - 3900f) / 250f)) * 0.6f }.background(Brand.Teal),
        )
    }
}
