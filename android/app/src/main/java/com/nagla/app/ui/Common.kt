package com.nagla.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.exifinterface.media.ExifInterface
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.nagla.app.data.Me
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

/** who is signed in (null = signed out) */
object Session {
    var me by mutableStateOf<Me?>(null)
}

/**
 * Loads data and keeps the last good value on screen while it refreshes, so background
 * refreshes never blank or flicker the UI. Errors keep the old data and show a note.
 */
class Loader<T>(private val scope: CoroutineScope, private val fetch: suspend () -> T) {
    var data by mutableStateOf<T?>(null)
    var error by mutableStateOf<String?>(null)
    var refreshing by mutableStateOf(false)
    var loading by mutableStateOf(true)

    fun reload(silent: Boolean = false) {
        scope.launch {
            if (!silent && data != null) refreshing = true
            try {
                val v = fetch()
                data = v; error = null
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = errorText(e)
            } finally {
                refreshing = false; loading = false
            }
        }
    }
}

/** load on first show + on key change; with pollMs > 0 refresh quietly while the screen is visible */
@Composable
fun <T> rememberLoader(vararg keys: Any?, pollMs: Long = 0, fetch: suspend () -> T): Loader<T> {
    val scope = rememberCoroutineScope()
    val loader = remember(*keys) { Loader(scope, fetch) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(loader) {
        loader.reload()
        if (pollMs > 0) lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) { delay(pollMs); loader.reload(silent = true) }
        }
    }
    return loader
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppScreen(
    title: String,
    onBack: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
    bottomBar: @Composable () -> Unit = {},
    showTopBar: Boolean = true,
    content: @Composable (PaddingValues) -> Unit,
) {
    Scaffold(
        topBar = {
            if (showTopBar) TopAppBar(
                title = { Text(title, style = MaterialTheme.typography.titleLarge, maxLines = 1) },
                navigationIcon = { if (onBack != null) IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, t("رجوع", "Back")) } },
                actions = actions,
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = bottomBar,
        containerColor = MaterialTheme.colorScheme.background,
        content = content,
    )
}

/** a pull-to-refresh list with the standard page padding */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> RefreshList(loader: Loader<T>, padding: PaddingValues, content: LazyListScope.(T) -> Unit) {
    PullToRefreshBox(isRefreshing = loader.refreshing, onRefresh = { loader.reload() }, modifier = Modifier.padding(padding).fillMaxSize()) {
        val data = loader.data
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (loader.error != null) item { ErrorNote(loader.error) }
            when {
                data != null -> content(data)
                loader.loading -> item { Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = androidx.compose.ui.Alignment.Center) { CircularProgressIndicator() } }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

/** a photo from the camera / gallery as an upright JPEG, at most 1600 px (the API also strips EXIF) */
suspend fun compressPhoto(context: Context, uri: Uri, maxSide: Int = 1600): ByteArray = withContext(Dispatchers.IO) {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
    val bmp = context.contentResolver.openInputStream(uri).use {
        BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
    } ?: throw IllegalArgumentException("not an image")
    val rotation = runCatching {
        context.contentResolver.openInputStream(uri).use { s ->
            when (ExifInterface(s!!).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
        }
    }.getOrDefault(0f)
    val scale = minOf(1f, maxSide.toFloat() / maxOf(bmp.width, bmp.height))
    val m = Matrix().apply { postScale(scale, scale); postRotate(rotation) }
    val out = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
    ByteArrayOutputStream().use { o -> out.compress(Bitmap.CompressFormat.JPEG, 85, o); o.toByteArray() }
}
