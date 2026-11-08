// Arabic/English labels for the API's values. Keys match the backend exactly.

// marketing cards on the landing page
export const services = {
  home: ["نقل منزل كامل", "Full home move"],
  furniture: ["نقل أثاث", "Furniture transport"],
  single: ["توصيل قطعة", "Single-item delivery"],
  packing: ["تغليف وفك تغليف", "Packing & unpacking"],
  assembly: ["فك وتركيب", "Furniture assembly"],
};

export const MAIN_STAGES = [
  "confirmed", "accepted", "crew_assigned", "on_the_way", "arrived_pickup",
  "loading", "loaded", "in_transit", "arrived_destination", "unloading", "completed",
];
export const TECH_STAGES = MAIN_STAGES.slice(MAIN_STAGES.indexOf("on_the_way"));

export const stages = {
  draft: ["مسودة", "Draft"],
  confirmed: ["بانتظار قبول الشركة", "Waiting for the company"],
  accepted: ["قبلت الشركة الطلب", "Accepted by the company"],
  crew_assigned: ["تم تعيين الفني", "Technician assigned"],
  on_the_way: ["الفريق في الطريق إليك", "Crew on the way"],
  arrived_pickup: ["وصل الفريق للاستلام", "At pickup"],
  loading: ["جارٍ التحميل", "Loading"],
  loaded: ["تم التحميل", "Loaded"],
  in_transit: ["في الطريق للوجهة", "In transit"],
  arrived_destination: ["وصل الفريق للوجهة", "At destination"],
  unloading: ["جارٍ التفريغ", "Unloading"],
  completed: ["مكتمل", "Completed"],
  rejected: ["رفضت الشركة الطلب", "Rejected by the company"],
  cancelled: ["ملغى", "Cancelled"],
};

/** short action labels for the technician status buttons */
export const techAction = {
  on_the_way: ["انطلقت إلى العميل", "Start driving"],
  arrived_pickup: ["وصلت للاستلام", "Arrived at pickup"],
  loading: ["بدء التحميل", "Start loading"],
  loaded: ["تم التحميل", "Loaded"],
  in_transit: ["بدء الرحلة", "Start transit"],
  arrived_destination: ["وصلت للوجهة", "Arrived at delivery"],
  unloading: ["بدء التفريغ", "Start unloading"],
  completed: ["تم التسليم", "Complete the move"],
};

export const dispositions = {
  keep: ["نقل", "Move"],
  sell: ["بيع", "Sell"],
  donate: ["تبرع", "Donate"],
};

export const roles = {
  customer: ["العميل", "Customer"],
  company_admin: ["شركة النقل", "Moving company"],
  agent: ["الفني", "Technician"],
  system: ["النظام", "System"],
};

export const services2 = {
  moving: ["نقل", "Moving"],
  disassembly: ["فك", "Disassembly"],
  assembly: ["تركيب", "Assembly"],
  fragile_packing: ["تغليف القطع القابلة للكسر", "Fragile packing"],
};

export const rooms = [
  ["living_room", "غرفة المعيشة", "Living room"],
  ["majlis", "المجلس", "Majlis"],
  ["bedroom_1", "غرفة النوم ١", "Bedroom 1"],
  ["bedroom_2", "غرفة النوم ٢", "Bedroom 2"],
  ["bedroom_3", "غرفة النوم ٣", "Bedroom 3"],
  ["kitchen", "المطبخ", "Kitchen"],
  ["dining_room", "غرفة الطعام", "Dining room"],
  ["office", "المكتب", "Office"],
  ["storage", "المخزن", "Storage"],
];

/** badge colour group (their CSS: pending / active / completed / cancelled) */
export function bucket(status, stage) {
  if (status === "draft" || stage === "confirmed" || !stage) return "pending";
  if (stage === "completed") return "completed";
  if (stage === "rejected" || stage === "cancelled" || status === "cancelled") return "cancelled";
  return "active";
}

/** where a move is: the stage once confirmed, else its status */
export const where = (m) => m.current_stage || m.status;
