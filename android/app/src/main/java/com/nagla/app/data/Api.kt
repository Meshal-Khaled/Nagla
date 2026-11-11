package com.nagla.app.data

import com.nagla.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.Dns
import java.net.Inet4Address
import java.net.InetAddress
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder
import java.util.UUID
import java.util.concurrent.TimeUnit

class ApiException(val status: Int, val code: String, override val message: String) : Exception(message)

/** Naqla API client. Tokens live in Prefs; one silent refresh on 401. */
object Api {
    val base: String = BuildConfig.API_BASE.trimEnd('/')
    val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }
    /**
     * IPv4 first: some networks (phone hotspots) hand out IPv6 addresses that go nowhere, and OkHttp 4
     * tries addresses one by one, so a dead IPv6 route stalled every request until its timeout.
     */
    private val ipv4First = object : Dns {
        override fun lookup(hostname: String): List<InetAddress> =
            Dns.SYSTEM.lookup(hostname).sortedBy { if (it is Inet4Address) 0 else 1 }
    }
    /** shared by the API, the image loader (Coil) and the map (MapLibre) */
    val http: OkHttpClient = OkHttpClient.Builder()
        .dns(ipv4First)
        .connectTimeout(8, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).writeTimeout(120, TimeUnit.SECONDS)
        .build()
    private val jsonType = "application/json".toMediaType()
    private val refreshLock = Mutex()

    fun url(path: String) = if (path.startsWith("http")) path else base + path
    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
    fun key() = UUID.randomUUID().toString()

    private suspend fun raw(method: String, path: String, body: RequestBody?, auth: Boolean): Pair<Int, String> = withContext(Dispatchers.IO) {
        val b = Request.Builder().url(url(path)).method(method, body ?: if (method == "POST" || method == "PATCH") ByteArray(0).toRequestBody(null) else null)
        if (auth) Prefs.access?.let { b.header("Authorization", "Bearer $it") }
        try {
            http.newCall(b.build()).execute().use { r -> r.code to (r.body?.string() ?: "") }
        } catch (e: IOException) {
            android.util.Log.w("Naqla", "$method $path failed: $e")
            throw ApiException(0, "network", "network")
        }
    }

    private suspend fun refreshTokens(): Boolean = refreshLock.withLock {
        val refresh = Prefs.refresh ?: return false
        val (code, text) = raw("POST", "/auth/refresh", buildJsonObject { put("refresh_token", refresh) }.toString().toRequestBody(jsonType), false)
        if (code != 200) { Prefs.clearSession(); return false }
        val t = json.decodeFromString<Tokens>(text)
        Prefs.access = t.access_token; Prefs.refresh = t.refresh_token
        true
    }

    /** request → response text; throws ApiException with the API's error code and message */
    suspend fun call(method: String, path: String, body: RequestBody? = null, auth: Boolean = true): String {
        var (code, text) = raw(method, path, body, auth)
        if (code == 401 && auth && Prefs.refresh != null && path != "/auth/refresh") {
            val access = Prefs.access
            if (refreshTokens() || access != Prefs.access) {
                val retry = raw(method, path, body, auth); code = retry.first; text = retry.second
            }
        }
        if (code !in 200..299) {
            val err = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull()
            throw ApiException(code, err?.get("error")?.jsonPrimitive?.content ?: "http_$code", err?.get("message")?.jsonPrimitive?.content ?: "Error $code")
        }
        return text
    }

    private fun JsonElement.body() = toString().toRequestBody(jsonType)
    private suspend inline fun <reified T> get(path: String): T = json.decodeFromString(call("GET", path))
    private suspend inline fun <reified T> post(path: String, body: JsonElement? = null): T = json.decodeFromString(call("POST", path, body?.body()))
    private suspend fun postUnit(path: String, body: JsonElement? = null) { call("POST", path, body?.body()) }

    fun obj(vararg pairs: Pair<String, Any?>): JsonObject = JsonObject(pairs.associate { (k, v) -> k to toJson(v) })
    @Suppress("UNCHECKED_CAST")
    private fun toJson(v: Any?): JsonElement = when (v) {
        null -> JsonNull
        is JsonElement -> v
        is String -> JsonPrimitive(v)
        is Number -> JsonPrimitive(v)
        is Boolean -> JsonPrimitive(v)
        is Map<*, *> -> JsonObject((v as Map<String, Any?>).mapValues { toJson(it.value) })
        else -> JsonPrimitive(v.toString())
    }

    // ---------- auth + profile
    suspend fun login(email: String, password: String): Tokens = post("/auth/login", obj("email" to email, "password" to password))
    suspend fun register(name: String, email: String, password: String): Tokens =
        post("/auth/register", obj("name" to name, "email" to email, "password" to password))
    suspend fun googleNative(idToken: String): GoogleSignIn = post("/auth/google/native", obj("id_token" to idToken))
    suspend fun googleComplete(signupToken: String, name: String, phone: String, gender: String): Tokens =
        post("/auth/google/complete", obj("signup_token" to signupToken, "name" to name, "phone" to phone, "gender" to gender))
    suspend fun googleStatus(): GoogleStatus = json.decodeFromString(call("GET", "/auth/google/status", auth = false))
    suspend fun me(): Me = get("/auth/me")
    suspend fun logout() { Prefs.refresh?.let { runCatching { call("POST", "/auth/logout", obj("refresh_token" to it).body(), auth = false) } } }
    suspend fun patchMe(name: String?, phone: String?): Me =
        json.decodeFromString(call("PATCH", "/auth/me", obj(*listOfNotNull(name?.let { "name" to it }, "phone" to phone).toTypedArray()).body()))
    suspend fun changePassword(current: String?, new: String) = postUnit("/auth/password", obj("current_password" to current, "new_password" to new))
    suspend fun stats(): Stats = get("/me/stats")
    suspend fun addresses(): List<SavedAddress> = get("/me/addresses")
    suspend fun addAddress(label: String, address: String, lat: Double?, lng: Double?, floor: Int?, elevator: Boolean?, details: AddressDetails?): SavedAddress =
        post("/me/addresses", obj("label" to label, "address" to address, "lat" to lat, "lng" to lng, "floor" to floor, "has_elevator" to elevator,
            "details" to details?.let { json.encodeToJsonElement(AddressDetails.serializer(), it) }))
    suspend fun deleteAddress(id: String) { call("DELETE", "/me/addresses/$id") }

    // ---------- customer moves
    suspend fun moves(view: String = "current"): List<MoveRow> = get("/moves?view=$view")
    suspend fun createMove(): MoveRow = post("/moves")
    suspend fun move(id: String): MoveDetail = get("/moves/$id")
    suspend fun patchMove(id: String, body: JsonObject): MoveDetail = json.decodeFromString(call("PATCH", "/moves/$id", body.body()))
    suspend fun saveDraft(id: String) = postUnit("/moves/$id/save-draft")
    suspend fun deleteMove(id: String) { call("DELETE", "/moves/$id") }
    suspend fun archive(id: String) = postUnit("/moves/$id/archive")
    suspend fun unarchive(id: String) = postUnit("/moves/$id/unarchive")
    suspend fun uploadPhotos(id: String, room: String, jpegs: List<ByteArray>) {
        val form = MultipartBody.Builder().setType(MultipartBody.FORM).addFormDataPart("room", room)
        jpegs.forEachIndexed { i, b -> form.addFormDataPart("file", "photo$i.jpg", b.toRequestBody("image/jpeg".toMediaType())) }
        call("POST", "/moves/$id/photos", form.build())
    }
    suspend fun deletePhoto(id: String) { call("DELETE", "/photos/$id") }
    suspend fun plan(id: String): PlanStarted = post("/moves/$id/plan")
    suspend fun job(id: String): Job = get("/jobs/$id")
    suspend fun aiRuns(moveId: String): List<AiRun> = get("/moves/$moveId/ai-runs")
    suspend fun catalog(q: String): List<CatalogRow> = get("/catalog" + if (q.isBlank()) "" else "?q=${enc(q)}")
    suspend fun addItem(moveId: String, catalogId: String, name: String? = null, quantity: Int = 1) {
        // optional fields are left out when empty (the API takes a missing field, not null)
        val body = obj(*listOfNotNull("catalog_id" to catalogId, "quantity" to quantity, name?.trim()?.takeIf { it.isNotEmpty() }?.let { "name" to it }).toTypedArray())
        call("POST", "/moves/$moveId/items", body.body())
    }
    suspend fun patchItem(id: String, body: JsonObject): MoveDetail = json.decodeFromString(call("PATCH", "/items/$id", body.body()))
    suspend fun deleteItem(id: String): MoveDetail = json.decodeFromString(call("DELETE", "/items/$id"))
    suspend fun quotes(id: String): Offers = get("/moves/$id/quotes")
    /** booking step 5: the moving plan for the chosen offer (kept on the server while nothing changes) */
    suspend fun movePlan(id: String, companyId: String, refresh: Boolean = false): MovePlan =
        post("/moves/$id/move-plan", obj("company_id" to companyId, "refresh" to refresh))
    suspend fun confirm(id: String, companyId: String) { call("POST", "/moves/$id/confirm", obj("company_id" to companyId).body()) }
    suspend fun tracking(id: String): Tracking = get("/moves/$id/tracking")
    suspend fun cancel(id: String, reason: String? = null, note: String? = null) =
        postUnit("/moves/$id/cancel", obj(*listOfNotNull("idempotency_key" to key(), reason?.let { "reason" to it }, note?.let { "note" to it }).toTypedArray()))
    suspend fun messages(id: String): List<Message> = get("/moves/$id/messages")
    suspend fun sendMessage(id: String, body: String) = postUnit("/moves/$id/messages", obj("body" to body))
    suspend fun ratings(id: String): List<Rating> = get("/moves/$id/ratings")
    suspend fun rateService(id: String, stars: Int, comment: String?) = postUnit("/moves/$id/rating", obj("stars" to stars, "comment" to comment?.ifBlank { null }))

    // ---------- company admin
    suspend fun companyMoves(scope: String): List<MoveRow> = get("/company/moves?scope=$scope")
    suspend fun setStage(id: String, stage: String) = postUnit("/moves/$id/events", obj("stage" to stage, "idempotency_key" to key()))
    suspend fun assign(id: String, agentId: String) = postUnit("/company/moves/$id/assign", obj("agent_id" to agentId))
    suspend fun agents(): List<Agent> = get("/company/agents")
    suspend fun addAgent(name: String, email: String, password: String) = postUnit("/company/agents", obj("name" to name, "email" to email, "password" to password))
    suspend fun jobSheet(id: String): FullJobSheet = get("/moves/$id/job-sheet")

    // ---------- technician
    suspend fun techSummary(): TechSummary = get("/tech/summary")
    suspend fun techTasks(scope: String): List<TaskRow> = get("/tech/tasks?scope=$scope")
    suspend fun task(id: String): TaskDetail = get("/tech/tasks/$id")
    suspend fun techStatus(id: String, stage: String, photo: ByteArray?) {
        if (photo == null) { postUnit("/tech/tasks/$id/status", obj("stage" to stage, "idempotency_key" to key())); return }
        val form = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("stage", stage).addFormDataPart("idempotency_key", key())
            .addFormDataPart("photo", "status.jpg", photo.toRequestBody("image/jpeg".toMediaType())).build()
        call("POST", "/tech/tasks/$id/status", form)
    }
    suspend fun rateClient(id: String, stars: Int, comment: String?) = postUnit("/tech/tasks/$id/rate-client", obj("stars" to stars, "comment" to comment?.ifBlank { null }))
    suspend fun techProfile(): TechProfile = get("/tech/profile")

    // ---------- maps (Hudhud through the API)
    suspend fun geoConfig(): GeoConfig = get("/geo/config")
    suspend fun geoSearch(q: String): List<GeoAddress> = get("/geo/search?q=${enc(q)}")
    suspend fun geoReverse(lat: Double, lng: Double): GeoAddress = get("/geo/reverse?lat=$lat&lng=$lng")
    suspend fun geoShortcode(code: String): GeoAddress = get("/geo/shortcode/${enc(code)}")
}
