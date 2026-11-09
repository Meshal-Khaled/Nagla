package com.nagla.app.data

import kotlinx.serialization.Serializable

// Mirrors of the API's JSON (unknown keys are ignored, so the API can add fields freely).

@Serializable data class Tokens(val access_token: String, val refresh_token: String)

@Serializable data class Me(
    val id: String, val name: String, val email: String, val role: String,
    val phone: String? = null, val company_id: String? = null, val company_name: String? = null,
)

@Serializable data class Progress(val index: Int = 0, val total: Int = 10, val percent: Int = 0)

/** a move in a list: customer (/moves) or company (/company/moves) */
@Serializable data class MoveRow(
    val id: String, val move_no: Long? = null, val status: String, val current_stage: String? = null,
    val date_from: String? = null, val date_to: String? = null, val preferred_time: String? = null,
    val pickup_address: String? = null, val dropoff_address: String? = null, val created_at: String? = null,
    val company_name: String? = null, val item_count: Int? = null, val draft_saved: Boolean? = null, val archived_at: String? = null,
    val customer_name: String? = null, val price_halalas: Long? = null, val truck_name: String? = null,
    val assigned_agent_id: String? = null, val assigned_agent_name: String? = null, val progress: Progress? = null,
)

@Serializable data class AddressDetails(
    val place_name: String? = null, val street: String? = null, val building_number: String? = null,
    val district: String? = null, val city: String? = null, val province: String? = null,
    val postal_code: String? = null, val short_code: String? = null, val additional_number: String? = null,
)

@Serializable data class Person(val id: String, val name: String)
@Serializable data class CompanyRef(val id: String, val name_en: String, val name_ar: String? = null)

@Serializable data class Item(
    val id: String, val category: String, val quantity: Int, val disposition: String = "keep", val source: String = "ai",
    val catalog_id: String, val custom_name: String? = null, val name_en: String, val name_ar: String,
    val catalog_name_en: String? = null, val catalog_name_ar: String? = null, val size_class: String? = null,
    val volume_m3: Double = 0.0, val weight_kg: Double = 0.0, val fragile: Boolean = false, val dismantle_minutes: Int = 0,
)

@Serializable data class Box(val x: Double, val y: Double, val w: Double, val h: Double)
/** one sighting of an item in a photo; cell = 3x3 grid cell holding it (1 top-left … 9 bottom-right) */
@Serializable data class Detection(
    val id: String, val item_id: String? = null, val category: String, val confidence: Double? = null,
    val cell: Int? = null, val label: String? = null, val box: Box? = null,
)
@Serializable data class Photo(
    val id: String, val room: String, val url: String, val width: Int? = null, val height: Int? = null,
    val scanned: Boolean = false, val created_at: String? = null, val detections: List<Detection> = emptyList(),
)
/** what the vision model and the filter answered for one room (debugging a scan) */
@Serializable data class AiRun(
    val id: String, val room: String, val vision_raw: String, val vision_items: Int, val filter_raw: String? = null,
    val filter_error: String? = null, val kept_items: Int, val created_at: String,
)

@Serializable data class LockedQuote(
    val truck_name: String? = null, val truck_capacity_m3: Double = 0.0, val trips: Int = 1, val crew_size: Int = 2,
    val estimated_minutes: Int = 0, val volume_m3: Double = 0.0, val price_halalas: Long = 0,
)

@Serializable data class MoveDetail(
    val id: String, val move_no: Long = 0, val status: String, val current_stage: String? = null,
    val customer_id: String? = null, val company_id: String? = null, val assigned_agent_id: String? = null,
    val pickup_address: String? = null, val pickup_lat: Double? = null, val pickup_lng: Double? = null,
    val pickup_floor: Int? = null, val pickup_has_elevator: Boolean? = null, val pickup_details: AddressDetails? = null,
    val dropoff_address: String? = null, val dropoff_lat: Double? = null, val dropoff_lng: Double? = null,
    val dropoff_floor: Int? = null, val dropoff_has_elevator: Boolean? = null, val dropoff_details: AddressDetails? = null,
    val date_from: String? = null, val date_to: String? = null, val preferred_time: String? = null, val notes: String? = null,
    val draft_saved: Boolean = false, val archived_at: String? = null,
    val customer: Person? = null, val technician: Person? = null, val company: CompanyRef? = null, val progress: Progress? = null,
    val items: List<Item> = emptyList(), val photos: List<Photo> = emptyList(), val quote: LockedQuote? = null,
)

@Serializable data class Offer(
    val company_id: String, val company_name: String, val company_city: String? = null, val google_rating: Double? = null,
    val truck_name: String, val truck_capacity_m3: Double,
    val trips: Int, val crew_size: Int, val estimated_minutes: Int, val volume_m3: Double, val price_halalas: Long,
)
@Serializable data class Offers(
    val locked: Boolean = false, val offers: List<Offer> = emptyList(),
    val volume_m3: Double? = null, val raw_volume_m3: Double? = null, val companies_checked: Int = 0,
)

@Serializable data class Job(val id: String, val status: String, val error: String? = null)
@Serializable data class PlanStarted(val job_id: String, val status: String)

@Serializable data class Event(
    val id: String, val stage: String, val actor_type: String, val skipped: Boolean = false,
    val photo_url: String? = null, val created_at: String,
)
@Serializable data class Tracking(
    val move_id: String, val status: String, val current_stage: String? = null,
    val progress: Progress? = null, val events: List<Event> = emptyList(),
)

@Serializable data class Message(
    val id: String, val sender_id: String, val sender_role: String, val sender_name: String? = null,
    val body: String, val created_at: String,
)
@Serializable data class Rating(val rater_role: String? = null, val stars: Int, val comment: String? = null, val created_at: String? = null)

@Serializable data class Counts(val assigned: Int = 0, val in_progress: Int = 0, val completed: Int = 0)
@Serializable data class TaskRow(
    val id: String, val move_no: Long, val status: String, val current_stage: String? = null,
    val pickup_address: String? = null, val dropoff_address: String? = null,
    val date_from: String? = null, val date_to: String? = null, val preferred_time: String? = null,
    val customer_name: String = "", val bucket: String = "assigned", val progress: Progress? = null,
)
@Serializable data class TechSummary(val name: String, val counts: Counts, val next_task: TaskRow? = null)

@Serializable data class Place(
    val address: String? = null, val lat: Double? = null, val lng: Double? = null, val floor: Int? = null,
    val has_elevator: Boolean? = null, val navigation_url: String? = null,
)
@Serializable data class Schedule(val date_from: String? = null, val date_to: String? = null, val preferred_time: String? = null)
@Serializable data class SheetTotals(val items: Int = 0, val volume_m3: Double = 0.0, val weight_kg: Double = 0.0, val dismantle_minutes: Int = 0)
@Serializable data class LoadItem(
    val step: Int, val label: String = "", val name_en: String, val name_ar: String, val quantity: Int = 1,
    val fragile: Boolean = false, val dismantle: Boolean = false, val heavy: Boolean = false,
)
@Serializable data class JobSheet(val totals: SheetTotals = SheetTotals(), val load_order: List<LoadItem> = emptyList())
@Serializable data class SheetQuote(val truck_name: String? = null, val trips: Int = 1, val crew_size: Int = 2, val estimated_minutes: Int = 0)
@Serializable data class FullJobSheet(val totals: SheetTotals = SheetTotals(), val load_order: List<LoadItem> = emptyList(), val quote: SheetQuote? = null)
@Serializable data class StatusStep(val stage: String, val label: String = "", val done: Boolean = false)
@Serializable data class TaskDetail(
    val id: String, val move_no: Long, val status: String, val current_stage: String? = null, val bucket: String = "",
    val progress: Progress? = null, val customer: Person, val pickup: Place, val dropoff: Place, val schedule: Schedule,
    val notes: String? = null, val services: List<String> = emptyList(), val quote: SheetQuote? = null,
    val job_sheet: JobSheet = JobSheet(), val statuses: List<StatusStep> = emptyList(), val next_stages: List<String> = emptyList(),
    val recommended_next: String? = null, val duration_minutes: Int? = null, val client_rating: Rating? = null,
    val events: List<Event> = emptyList(),
)

@Serializable data class RatingSummary(val average: Double? = null, val count: Int = 0)
@Serializable data class Performance(val assigned: Int = 0, val in_progress: Int = 0, val completed_last_30_days: Int = 0, val avg_job_minutes: Int? = null)
@Serializable data class Review(val move_no: Long, val stars: Int, val comment: String? = null, val created_at: String? = null)
@Serializable data class TechProfile(
    val name: String, val email: String, val company_name: String? = null, val completed_moves: Int = 0,
    val rating: RatingSummary = RatingSummary(), val performance: Performance = Performance(), val recent_reviews: List<Review> = emptyList(),
)

@Serializable data class Stats(
    val member_since: String? = null, val has_password: Boolean = true, val google_linked: Boolean = false,
    val moves: Int = 0, val active: Int = 0, val completed: Int = 0, val drafts: Int = 0, val archived: Int = 0,
    val incoming: Int = 0, val technicians: Int = 0, val rating: RatingSummary? = null,
)

@Serializable data class CatalogRow(
    val id: String, val category: String, val variant: String = "", val name_en: String, val name_ar: String,
    val size_class: String = "", val volume_m3: Double = 0.0,
)

@Serializable data class Agent(val id: String, val name: String, val email: String)

@Serializable data class SavedAddress(
    val id: String, val label: String, val address: String, val lat: Double? = null, val lng: Double? = null,
    val floor: Int? = null, val has_elevator: Boolean? = null, val details: AddressDetails? = null,
)

@Serializable data class GeoAddress(
    val display_name: String = "", val place_name: String? = null, val lat: Double, val lng: Double,
    val street: String? = null, val district: String? = null, val city: String? = null, val province: String? = null,
    val postal_code: String? = null, val short_code: String? = null,
)
@Serializable data class GeoConfig(val provider: String = "device", val map_style_url: String? = null)
@Serializable data class GoogleStatus(val enabled: Boolean = false, val native: Boolean = false, val client_id: String? = null)
