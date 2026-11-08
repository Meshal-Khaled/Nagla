import {
  t,
  tr,
  icon,
  link,
  button,
  logo,
  toolsBar,
  who,
  svcIcon,
} from "./ui.js";
import { services } from "./labels.js";
const descriptions = {
  home: [
    "من باب منزلك القديم إلى بابك الجديد.",
    "From your old front door to your new one.",
  ],
  furniture: [
    "نقل الأثاث الكبير بعناية واهتمام.",
    "Careful handling for larger furniture.",
  ],
  single: ["توصيل غرض واحد إلى وجهته.", "A dedicated trip for a single piece."],
  packing: [
    "حماية مقتنياتك قبل الرحلة وبعدها.",
    "Protect your belongings for the journey.",
  ],
  assembly: [
    "فك القطع وتجميعها في مكانها الجديد.",
    "Take furniture apart and rebuild it at home.",
  ],
};
const how = [
  [
    "صوّر غرفك",
    "Photograph your rooms",
    "ارفع صور كل غرفة، ويتعرف الذكاء الاصطناعي على الأثاث والأغراض تلقائياً.",
    "Upload photos of each room and AI recognises your furniture and belongings.",
  ],
  [
    "قارن الأسعار",
    "Compare prices",
    "راجع قائمة الأغراض، أضف العناوين والموعد، ثم قارن عروض شركات النقل واختر الأنسب.",
    "Review the item list, add addresses and a date, then compare moving companies and pick one.",
  ],
  [
    "تابع الرحلة",
    "Follow the journey",
    "تابع الفني خطوة بخطوة، راسله من التطبيق، وقيّم الخدمة بعد التسليم.",
    "Follow your technician step by step, message them in the app and rate the service.",
  ],
];
export const faqs = [
  [
    "كيف يُحدّد سعر النقل؟",
    "How is my move priced?",
    "نحسب حجم أغراضك من قائمة الجرد، ثم نختار لكل شركة الشاحنة المناسبة وعدد الرحلات. ترى الأسعار جنباً إلى جنب قبل التأكيد.",
    "We work out the volume of your items, then pick each company's fitting truck and number of trips. You see the prices side by side before confirming.",
  ],
  [
    "هل يمكنني تعديل ما اكتشفه الذكاء الاصطناعي؟",
    "Can I fix what the AI detected?",
    "نعم، غيّر الكمية أو القرار (نقل، بيع، تبرع)، احذف الخطأ، وأضف ما فاته من الكتالوج.",
    "Yes. Change quantities or the decision (move, sell, donate), delete mistakes and add anything it missed from the catalog.",
  ],
  [
    "متى يتأكد موعد النقل؟",
    "When is my moving date confirmed?",
    "بعد تأكيد طلبك تقبله الشركة وتعيّن فنياً. يظهر كل تحديث في صفحة التتبع.",
    "After you confirm, the company accepts and assigns a technician. Every update appears on the tracking page.",
  ],
  [
    "هل يمكنني إلغاء الطلب؟",
    "Can I cancel?",
    "نعم، يمكنك الإلغاء من صفحة الطلب قبل أن يبدأ الفريق رحلته إليك.",
    "Yes, from the request page, until the crew is on the way to you.",
  ],
];
export function landing() {
  const signed = who();
  const start = signed?.role === "customer" ? "new" : "auth/customer?next=new";
  const nav =
    '<a href="#/home?section=services">' +
    t("خدماتنا", "Services") +
    '</a><a href="#/home?section=how">' +
    t("كيف تعمل نقلة؟", "How it works") +
    '</a><a href="#/home?section=faq">' +
    t("الأسئلة الشائعة", "FAQs") +
    "</a>";
  return (
    '<header class="publicnav"><div class="container bar"><a href="#/home">' +
    logo() +
    "</a><nav>" +
    nav +
    '</nav><div class="navtools">' +
    toolsBar() +
    link(
      signed ? "dashboard" : "auth/customer",
      signed ? t("لوحتي", "My dashboard") : t("تسجيل الدخول", "Sign in"),
      "btn dark",
    ) +
    button(
      "mobile-menu",
      '<span class="sr">' + t("القائمة", "Menu") + "</span>",
      "iconbtn mobile",
      "menu",
    ) +
    '</div></div><nav class="mobilelinks" hidden>' +
    nav +
    "</nav></header>" +
    '<main id="content" tabindex="-1"><section class="hero"><div class="container hero-grid"><div class="hero-copy"><div class="location-tag">' +
    icon("pin", 15) +
    t("خدمات النقل في السعودية", "Moving services in Saudi Arabia") +
    "</div>" +
    "<h1>" +
    t(
      "نقل عفشك <br>صار <em>أسهل.</em>",
      "Your next move, <br><em>made easier.</em>",
    ) +
    "</h1><p>" +
    t(
      "من أول كرتون إلى آخر قطعة أثاث. خطّط لنقل بيتك، اطلب فريقك، وتابع كل خطوة من مكان واحد.",
      "From the first box to the last piece of furniture. Plan your move, book a team and follow every step in one place.",
    ) +
    "</p>" +
    '<div class="hero-actions">' +
    link(
      start,
      t("ابدأ نقلتك", "Start moving") + icon("arrow"),
      "btn primary",
    ) +
    '<a class="btn outline" href="#/home?section=how">' +
    t("كيف تعمل نقلة؟", "How it works") +
    icon("down", 16) +
    "</a></div>" +
    '<div class="hero-foot">' +
    icon("shield", 18) +
    t("أسعار قبل التأكيد", "Prices before you confirm") +
    "<i></i>" +
    icon("route", 18) +
    t("تتبّع لكل مرحلة", "Step-by-step tracking") +
    "</div></div>" +
    '<figure class="hero-figure"><img src="./assets/moving-truck.webp" alt="' +
    t(
      "رسم لشاحنة نقل متوقفة أمام منزل في الرياض",
      "Illustration of a moving truck outside a Riyadh home",
    ) +
    '" fetchpriority="high"><figcaption><span class="route-icon">' +
    icon("route", 24) +
    "</span><span><small>" +
    t("رحلة نقل منزلية", "A home-moving route") +
    "</small><strong>" +
    t("الملقا", "Al Malqa") +
    " " +
    icon("arrow", 16) +
    " " +
    t("الياسمين", "Al Yasmin") +
    '</strong></span><span class="fig-city">' +
    icon("pin", 14) +
    t("الرياض", "Riyadh") +
    "</span></figcaption></figure></div></section>" +
    '<section class="section container" id="services"><div class="sectionhead"><div><small class="eyebrow">' +
    t("خدمات نقلة", "Naqla services") +
    "</small><h2>" +
    t("وش تحتاج لنقلتك؟", "What are you moving?") +
    '</h2></div><span class="subtle">' +
    t("اختر الخدمة التي تناسبك", "Choose a service to get started") +
    '</span></div><div class="service-grid">' +
    Object.keys(services)
      .map(
        (s, i) =>
          '<a class="service-card sc' +
          i +
          '" href="#/' +
          (signed?.role === "customer"
            ? "new?service=" + s
            : "auth/customer?next=new&service=" + s) +
          '"><span class="service-icon">' +
          icon(svcIcon[s], 29) +
          "</span><h3>" +
          tr(services[s]) +
          "</h3><p>" +
          tr(descriptions[s]) +
          '</p><span class="card-arrow">' +
          icon("arrow", 17) +
          "</span></a>",
      )
      .join("") +
    "</div></section>" +
    '<section class="how-section" id="how"><div class="container"><small class="eyebrow">' +
    t("كيف تعمل نقلة؟", "How it works") +
    "</small><h2>" +
    t("من التخطيط إلى باب بيتك.", "From planning to your doorstep.") +
    '</h2><div class="steps-grid">' +
    how
      .map(
        ([ar, en, ad, ed], i) =>
          '<article><span class="stepno">0' +
          (i + 1) +
          "</span><h3>" +
          t(ar, en) +
          "</h3><p>" +
          t(ad, ed) +
          "</p></article>",
      )
      .join("") +
    "</div></div></section>" +
    '<section class="section container faq" id="faq"><div><small class="eyebrow">' +
    t("مركز المساعدة", "Help center") +
    "</small><h2>" +
    t("الأسئلة الشائعة", "Frequently asked questions") +
    "</h2></div><div>" +
    faqs
      .map(
        ([ar, en, ad, ed]) =>
          "<details><summary>" +
          t(ar, en) +
          "</summary><p>" +
          t(ad, ed) +
          "</p></details>",
      )
      .join("") +
    "</div></section></main>" +
    '<div class="start-dock">' +
    link(
      start,
      t("ابدأ نقلتك", "Start moving") + icon("arrow"),
      "btn primary",
    ) +
    "</div>" +
    '<footer><div class="container footerrow"><div>' +
    logo() +
    "<p>" +
    t(
      "منصة سعودية لتنظيم الانتقال.",
      "A Saudi platform for planning your move.",
    ) +
    "</p></div><div><strong>" +
    t("مساحات العمل", "Workspaces") +
    "</strong>" +
    link("auth/customer", t("العملاء", "Customers"), "textlink") +
    link("auth/company", t("شركات النقل", "Moving companies"), "textlink") +
    link("auth/tech", t("الفنيون", "Technicians"), "textlink") +
    "</div></div></footer>"
  );
}
