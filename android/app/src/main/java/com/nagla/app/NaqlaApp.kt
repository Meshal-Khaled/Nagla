package com.nagla.app

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import com.nagla.app.data.Api
import com.nagla.app.data.Prefs
import org.maplibre.android.MapLibre
import org.maplibre.android.module.http.HttpRequestUtil

class NaqlaApp : Application(), ImageLoaderFactory {
    override fun onCreate() {
        super.onCreate()
        Prefs.init(this)
        MapLibre.getInstance(this)
        // the map tiles use the same client (IPv4 first) as the API
        HttpRequestUtil.setOkHttpClient(Api.http)
    }

    // photos (signed /files/... URLs) load through the same client too
    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this).okHttpClient(Api.http).crossfade(true).build()
}
