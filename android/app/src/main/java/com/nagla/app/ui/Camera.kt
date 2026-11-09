package com.nagla.app.ui

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File

/**
 * Takes one photo with the phone's camera app, safely:
 * - the app declares the CAMERA permission, so Android refuses to open the camera until the user grants it
 *   (that refusal was the crash): ask first, then open the camera;
 * - the photo's file is kept across the app being closed in the background while the camera is open;
 * - no camera app, or any other failure, becomes a message instead of a crash.
 * Returns a function: call it with a file-name prefix to take a photo.
 */
@Composable
fun rememberCamera(onPhoto: (Uri) -> Unit, onCancel: () -> Unit = {}, onError: (String) -> Unit): (String) -> Unit {
    val context = LocalContext.current
    var pendingUri by rememberSaveable { mutableStateOf<String?>(null) }
    var pendingPrefix by rememberSaveable { mutableStateOf<String?>(null) }

    val capture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val uri = pendingUri?.let(Uri::parse)
        pendingUri = null
        if (ok && uri != null) onPhoto(uri) else onCancel()
    }

    fun open(prefix: String) {
        try {
            val dir = File(context.cacheDir, "camera").apply { mkdirs() }
            val uri = FileProvider.getUriForFile(context, context.packageName + ".files", File(dir, "$prefix-${System.currentTimeMillis()}.jpg"))
            pendingUri = uri.toString()
            capture.launch(uri)
        } catch (e: ActivityNotFoundException) {
            pendingUri = null
            onError(t("لا يوجد تطبيق كاميرا على الجهاز.", "There's no camera app on this phone."))
        } catch (e: Exception) {
            pendingUri = null
            onError(t("تعذر فتح الكاميرا.", "Couldn't open the camera.") + " " + (e.message ?: ""))
        }
    }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val prefix = pendingPrefix; pendingPrefix = null
        if (granted && prefix != null) open(prefix)
        else if (!granted) { onCancel(); onError(t("نحتاج إذن الكاميرا لالتقاط الصور. يمكنك اختيار صور من المعرض.", "Camera permission is needed to take photos. You can pick photos from the gallery instead.")) }
    }

    return { prefix ->
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) open(prefix)
        else { pendingPrefix = prefix; permission.launch(Manifest.permission.CAMERA) }
    }
}
