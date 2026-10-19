import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============================================================================
// 1. تهيئة قاعدة البيانات السحابية والثوابت وقائمة الدول العربية (22 دولة)
// ============================================================================
const firebaseConfig = {
    apiKey: "AIzaSyBtj65b-J9L7Oxf3iR1EE5tinF5FahVLpw",
    authDomain: "hujariya-1.firebaseapp.com",
    projectId: "hujariya-1",
    storageBucket: "hujariya-1.firebasestorage.app",
    messagingSenderId: "983562756581",
    appId: "1:983562756581:web:71ede7b120b50af894cf0c",
    measurementId: "G-ZE0H1NV0X5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const IMGBB_API_KEY = "E9d57b2ba79217bb8bde762b332b7c62".trim().toLowerCase();
const ADMIN_EMAILS = ["rawialshamal@gmail.com", "a1hmedrashad@gmail.com"];

const ARAB_COUNTRIES = [
    { name: "اليمن", flag: "🇾🇪" },
    { name: "السعودية", flag: "🇸🇦" },
    { name: "مصر", flag: "🇪🇬" },
    { name: "الإمارات", flag: "🇦🇪" },
    { name: "قطر", flag: "🇶🇦" },
    { name: "الكويت", flag: "🇰🇼" },
    { name: "سلطنة عمان", flag: "🇴🇲" },
    { name: "البحرين", flag: "🇧🇭" },
    { name: "العراق", flag: "🇮🇶" },
    { name: "سوريا", flag: "🇸🇾" },
    { name: "الأردن", flag: "🇯🇴" },
    { name: "فلسطين", flag: "🇵🇸" },
    { name: "لبنان", flag: "🇱🇧" },
    { name: "السودان", flag: "🇸🇩" },
    { name: "ليبيا", flag: "🇱🇾" },
    { name: "تونس", flag: "🇹🇳" },
    { name: "الجزائر", flag: "🇩🇿" },
    { name: "المغرب", flag: "🇲🇦" },
    { name: "موريتانيا", flag: "🇲🇷" },
    { name: "الصومال", flag: "🇸🇴" },
    { name: "جيبوتي", flag: "🇩🇯" },
    { name: "جزر القمر", flag: "🇰🇲" }
];

const $ = (id) => document.getElementById(id);

function isUserAdmin(user) {
    return Boolean(user && user.email && ADMIN_EMAILS.includes(user.email.trim().toLowerCase()));
}

// حالة النظام الشاملة (الإصدار 1.5)
let currentUser = null;
let isAdmin = false;
let allBooks = [];
let allReviews = [];
let allReviewReplies = [];
let allQuotes = [];
let allEditSuggestions = [];
let allAuthors = [];
let allPublishers = [];
let allReports = [];
let allAuditLogs = [];
let bookOverrides = {};
let userFavorites = [];
let userReadingProgress = JSON.parse(localStorage.getItem("hujariya_cloud_reading") || "{}");

let activeCategory = "all";
let activeCountry = "all";
let activeEra = "all";
let activeAuthorType = "all";
let activePubScope = "all";
let activeMyUploadsFilter = "all";
let activeAuthorRoleInModal = "public_figure";
let currentOpenBook = null;
let currentReaderBook = null;
let initialDeepLinkHandled = false;

// ============================================================================
// 2. الخوارزمية الصامتة في الخلفية (ترتيب ذكي خفي حسب اهتمامات القارئ)
// ============================================================================
let aiProfile = JSON.parse(localStorage.getItem("hujariya_silent_ai") || '{"categories":{},"authors":{},"countries":{},"eras":{},"queries":[]}');

function trackSilentSignal(type, value, weight = 1) {
    if (!value) return;
    if (type === "query") {
        const q = normalizeArabicText(value);
        if (q.length > 2 && !aiProfile.queries.includes(q)) {
            aiProfile.queries.unshift(q);
            aiProfile.queries = aiProfile.queries.slice(0, 15);
        }
    } else if (aiProfile[type]) {
        aiProfile[type][value] = (aiProfile[type][value] || 0) + weight;
    }
    localStorage.setItem("hujariya_silent_ai", JSON.stringify(aiProfile));
}

function computeSilentBookScore(book) {
    let score = 0;
    const normAuth = normalizeArabicIdentity(book.author);
    const cat = normalizeCategory(book.category);
    const country = book.country || "اليمن";

    score += (aiProfile.categories[cat] || 0) * 4;
    score += (aiProfile.authors[normAuth] || 0) * 6;
    score += (aiProfile.countries[country] || 0) * 2.5;
    score += (aiProfile.eras[book.era] || 0) * 1.5;

    if (userFavorites.includes(book.id)) score += 3;
    if (userReadingProgress[book.id]) score += 4;
    if (book.publishMode === "hujariya_press") score += 2.5;

    const searchableTitleAuth = normalizeArabicText(`${book.title || ""} ${book.author || ""}`);
    aiProfile.queries.forEach(q => {
        if (q && searchableTitleAuth.includes(q)) score += 5;
    });

    score += (book.ratingCount || 0) * 0.8;
    const ageScore = (book.createdAt || 0) / 1e12;
    return score + ageScore;
}

// ============================================================================
// 3. التطبيع اللغوي، محرك البحث الذكي الفائق الدقة، وتوليد أرقام الإيداع (HJ-PUB)
// ============================================================================
function normalizeArabicText(text) {
    if (!text) return "";
    return String(text)
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/[ىئ]/g, "ي")
        .replace(/ؤ/g, "و")
        .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function stripArabicPrefixes(word) {
    if (!word || word.length <= 3) return word;
    return word.replace(/^(وال|بال|كال|فال|لل|ال)/, "");
}

function normalizeArabicIdentity(text) {
    if (!text) return "";
    return normalizeArabicText(text)
        .replace(/^(روايه|كتاب|ديوان|مؤلف|الدكتور|دكتور|الاستاذ|الشاعر|الكاتب|العلامه|الشهيد|دار|مؤسسه|مكتبه|منشورات)\s+/g, "")
        .split(" ")
        .map(stripArabicPrefixes)
        .join(" ")
        .trim();
}

// توليد رقم إيداع أو رقم مرجعي موسوعي فريد وثابت لكل كتاب في الموسوعة
function getBookDepositSerial(book) {
    if (book.depositSerial) return book.depositSerial;
    const year = (book.cityYear && book.cityYear.match(/\d{4}/)?.[0]) || new Date(book.createdAt || Date.now()).getFullYear();
    let hash = 0;
    const seed = String(book.id || book.title || "HJ");
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    const numCode = String(Math.abs(hash) % 9000 + 1000);
    const prefix = book.publishMode === "hujariya_press" ? "HJ-PUB" : "HJ-REF";
    return `${prefix}-${year}-${numCode}`;
}

function computeSmartSearchRelevance(book, rawQuery) {
    const cleanQuery = normalizeArabicText(rawQuery);
    if (!cleanQuery) return 1;

    const queryTokens = cleanQuery.split(" ").filter(Boolean);
    if (queryTokens.length === 0) return 1;

    const serial = normalizeArabicText(getBookDepositSerial(book));
    const normTitle = normalizeArabicText(book.title);
    const normAuthor = normalizeArabicText(book.author);
    const normPublisher = normalizeArabicText(book.publisher);
    const normCountry = normalizeArabicText(book.country || "اليمن");
    const normCategory = normalizeArabicText(book.category);
    const normCityYear = normalizeArabicText(book.cityYear);
    const normIsbn = normalizeArabicText(book.isbn || "");
    const normDesc = normalizeArabicText(book.description);

    const fullCorpus = `${serial} ${normIsbn} ${normTitle} ${normAuthor} ${normPublisher} ${normCountry} ${normCategory} ${normCityYear} ${normDesc}`;
    const strippedCorpusWords = fullCorpus.split(" ").filter(Boolean).map(stripArabicPrefixes);

    let totalRelevance = 0;

    if (serial.includes(cleanQuery) || (normIsbn && normIsbn.includes(cleanQuery))) totalRelevance += 90;
    if (normTitle.includes(cleanQuery)) totalRelevance += 60;
    if (normAuthor.includes(cleanQuery)) totalRelevance += 50;
    if (normPublisher.includes(cleanQuery)) totalRelevance += 40;

    for (const token of queryTokens) {
        const strippedToken = stripArabicPrefixes(token);
        let tokenScore = 0;

        if (serial.includes(token) || normIsbn.includes(token)) tokenScore += 40;
        if (normTitle.includes(token) || (strippedToken.length >= 2 && normTitle.includes(strippedToken))) tokenScore += 25;
        if (normAuthor.includes(token) || (strippedToken.length >= 2 && normAuthor.includes(strippedToken))) tokenScore += 20;
        if (normPublisher.includes(token) || (strippedToken.length >= 2 && normPublisher.includes(strippedToken))) tokenScore += 15;
        if (normCountry.includes(token) || normCategory.includes(token) || normCityYear.includes(token)) tokenScore += 12;

        if (tokenScore === 0) {
            const matchedInDesc = fullCorpus.includes(token) ||
                (strippedToken.length >= 2 && strippedCorpusWords.some(w => w.includes(strippedToken) || strippedToken.includes(w)));
            if (matchedInDesc) tokenScore += 6;
        }

        if (tokenScore === 0) return 0;
        totalRelevance += tokenScore;
    }

    return totalRelevance;
}

function normalizeCategory(cat) {
    if (!cat) return "روايات وأدب";
    if (cat === "تاريخ وتراث يمني") return "تاريخ وتراث";
    return cat;
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, s => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[s]));
}

function getBaseSiteUrl() {
    return window.location.origin + window.location.pathname;
}

function getBookDirectUrl(bookId) {
    return `${getBaseSiteUrl()}?book=${encodeURIComponent(bookId)}`;
}

function getAuthorDirectUrl(authorName) {
    return `${getBaseSiteUrl()}?author=${encodeURIComponent(authorName)}`;
}

function getPublisherDirectUrl(publisherName) {
    return `${getBaseSiteUrl()}?publisher=${encodeURIComponent(publisherName)}`;
}

function getCountrySelectOptionsHtml(selectedCountry = "اليمن") {
    return ARAB_COUNTRIES.map(c =>
        `<option value="${escapeHtml(c.name)}" ${c.name === selectedCountry ? "selected" : ""}>${c.flag} ${escapeHtml(c.name)}</option>`
    ).join("");
}

async function compressAndUploadImage(file, maxWidth = 820, quality = 0.78) {
    const compressedBlob = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let w = img.width;
                let h = img.height;
                if (w > maxWidth) {
                    h = Math.round((h * maxWidth) / w);
                    w = maxWidth;
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", quality);
            };
            img.onerror = () => resolve(file);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });

    const fd = new FormData();
    fd.append("image", compressedBlob, "hujariya_img.jpg");
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: "POST",
        body: fd
    });
    const data = await res.json();
    if (!data.success) throw new Error("Upload failed");
    return data.data.url;
}

function extractDriveFileId(url) {
    if (!url) return null;
    const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    return m && m[1] ? m[1] : null;
}

function toDirectDriveDownload(url) {
    const id = extractDriveFileId(url);
    return id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
}

function toEmbedDrivePreview(url, pageNum = 1) {
    const id = extractDriveFileId(url);
    const base = id ? `https://drive.google.com/file/d/${id}/preview` : url;
    return pageNum > 1 ? `${base}#page=${pageNum}` : base;
}

function updateSeoAndUrl({ book = null, author = null, publisher = null, pushUrl = true } = {}) {
    const schemaEl = $("dynamicJsonLd");
    if (book) {
        const directUrl = getBookDirectUrl(book.id);
        const serial = getBookDepositSerial(book);
        document.title = `${book.title} - ${book.author} | مكتبة وموسوعة الحجرية`;
        if (pushUrl) window.history.replaceState({ bookId: book.id }, "", `?book=${encodeURIComponent(book.id)}`);
        if (schemaEl) {
            schemaEl.textContent = JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Book",
                "identifier": book.isbn || serial,
                "name": book.title,
                "author": { "@type": "Person", "name": book.author },
                "publisher": { "@type": "Organization", "name": book.publisher || "إصدارات مكتبة وموسوعة الحجرية" },
                "numberOfPages": book.pagesCount || undefined,
                "description": book.description,
                "image": book.coverUrl,
                "url": directUrl,
                "inLanguage": "ar",
                "countryOfOrigin": book.country || "اليمن",
                "genre": normalizeCategory(book.category)
            });
        }
    } else if (author) {
        const directUrl = getAuthorDirectUrl(author.name);
        document.title = `المؤلف ${author.name} | مكتبة وموسوعة الحجرية`;
        if (pushUrl) window.history.replaceState({ authorName: author.name }, "", `?author=${encodeURIComponent(author.name)}`);
        if (schemaEl) {
            schemaEl.textContent = JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Person",
                "name": author.name,
                "nationality": author.country || "اليمن",
                "description": author.bio,
                "image": author.photoUrl,
                "url": directUrl
            });
        }
    } else if (publisher) {
        const directUrl = getPublisherDirectUrl(publisher.name);
        document.title = `${publisher.name} | دار نشر في مكتبة وموسوعة الحجرية`;
        if (pushUrl) window.history.replaceState({ publisherName: publisher.name }, "", `?publisher=${encodeURIComponent(publisher.name)}`);
        if (schemaEl) {
            schemaEl.textContent = JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Organization",
                "name": publisher.name,
                "description": publisher.bio,
                "address": publisher.city || publisher.country || "",
                "logo": publisher.logoUrl,
                "url": directUrl
            });
        }
    } else {
        document.title = "مكتبة وموسوعة الحجرية | المنصة العربية لتوثيق المؤلفات والنشر الرقمي";
        if (pushUrl && (window.location.search.includes("book=") || window.location.search.includes("author=") || window.location.search.includes("publisher="))) {
            window.history.replaceState({}, "", window.location.pathname);
        }
    }
}

async function recordAuditLog(actionTitle, detailsText) {
    if (!currentUser) return;
    try {
        await addDoc(collection(db, "reviews"), {
            recordType: "audit",
            userId: currentUser.uid,
            userName: currentUser.displayName || currentUser.email,
            actionTitle,
            detailsText,
            createdAt: Date.now()
        });
    } catch (e) {}
}

// ============================================================================
// 4. الهيدر، الوضع الليلي الذكي (تبديل نسخة الشعار المضيئة تلقائياً)، والتنقل
// ============================================================================
function initHeaderInteractions() {
    const noticeBar = $("nonprofitNoticeBar");
    const hideLocal = localStorage.getItem("hujariya_hide_notice") === "1";
    if (noticeBar) {
        noticeBar.style.display = hideLocal ? "none" : "block";
    }

    if ($("dismissNoticeBtn")) {
        $("dismissNoticeBtn").addEventListener("click", async () => {
            if (noticeBar) noticeBar.style.display = "none";
            localStorage.setItem("hujariya_hide_notice", "1");
            if (currentUser) {
                try {
                    await updateDoc(doc(db, "users", currentUser.uid), { hideNotice: true });
                } catch (e) {}
            }
        });
    }

    if ($("toggleBrandDescBtn") && $("brandCollapsibleBox")) {
        $("toggleBrandDescBtn").addEventListener("click", () => {
            const box = $("brandCollapsibleBox");
            const isOpen = box.style.display !== "none";
            box.style.display = isOpen ? "none" : "block";
            $("toggleBrandDescBtn").classList.toggle("open", !isOpen);
            $("toggleBrandDescBtn").setAttribute("aria-expanded", String(!isOpen));
        });
    }

    if ($("toggleFiltersDrawerBtn") && $("advancedFiltersDrawer")) {
        $("toggleFiltersDrawerBtn").addEventListener("click", () => {
            const drawer = $("advancedFiltersDrawer");
            const isOpen = drawer.style.display !== "none";
            drawer.style.display = isOpen ? "none" : "block";
            $("toggleFiltersDrawerBtn").classList.toggle("active", !isOpen);
        });
    }
}
initHeaderInteractions();

// تبديل الوضع الليلي والنهاري مع تبديل الشعار المعالج ضوئياً
function applyThemeMode(isDark) {
    document.body.classList.toggle("dark-mode", isDark);
    document.body.classList.toggle("light-mode", !isDark);
    if ($("darkModeToggle")) $("darkModeToggle").checked = isDark;
    localStorage.setItem("hujariya_theme", isDark ? "dark" : "light");

    const wideLogoEl = $("headerWideLogoImg");
    if (wideLogoEl && window.__hujariyaLogos) {
        wideLogoEl.src = isDark ? window.__hujariyaLogos.darkUrl : window.__hujariyaLogos.lightUrl;
    }
}
applyThemeMode(localStorage.getItem("hujariya_theme") === "dark");

if ($("darkModeToggle")) {
    $("darkModeToggle").addEventListener("change", (e) => applyThemeMode(e.target.checked));
}
if ($("quickThemeToggle")) {
    $("quickThemeToggle").addEventListener("click", () => applyThemeMode(!document.body.classList.contains("dark-mode")));
}

function navigateToPage(targetId, keepSeoUrl = false) {
    document.querySelectorAll(".samsung-nav-btn[data-target]").forEach(btn => {
        const navTarget = btn.getAttribute("data-target");
        const isActive = navTarget === targetId ||
            (targetId === "bookDetailPageView" && navTarget === "shelvesView") ||
            ((targetId === "authorDetailPageView" || targetId === "publisherDetailPageView") && navTarget === "authorsView");
        btn.classList.toggle("active", isActive);
    });

    document.querySelectorAll(".view-page").forEach(page => {
        page.classList.toggle("active-page", page.id === targetId);
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
    if (!keepSeoUrl) updateSeoAndUrl({ pushUrl: true });
}

document.querySelectorAll(".samsung-nav-btn[data-target]").forEach(btn => {
    btn.addEventListener("click", () => navigateToPage(btn.getAttribute("data-target")));
});

if ($("brandHomeLogoBtn")) $("brandHomeLogoBtn").addEventListener("click", () => navigateToPage("shelvesView"));
if ($("backFromBookPageBtn")) $("backFromBookPageBtn").addEventListener("click", () => navigateToPage("shelvesView"));
if ($("backFromAuthorPageBtn")) {
    $("backFromAuthorPageBtn").addEventListener("click", () => {
        navigateToPage("authorsView");
        if ($("tabShowAuthorsBtn")) $("tabShowAuthorsBtn").click();
    });
}
if ($("backFromPublisherPageBtn")) {
    $("backFromPublisherPageBtn").addEventListener("click", () => {
        navigateToPage("authorsView");
        if ($("tabShowPublishersBtn")) $("tabShowPublishersBtn").click();
    });
}

if ($("tabShowAuthorsBtn") && $("tabShowPublishersBtn")) {
    $("tabShowAuthorsBtn").addEventListener("click", () => {
        $("tabShowAuthorsBtn").classList.add("active");
        $("tabShowPublishersBtn").classList.remove("active");
        $("authorsDirectoryBox").style.display = "block";
        $("publishersDirectoryBox").style.display = "none";
    });
    $("tabShowPublishersBtn").addEventListener("click", () => {
        $("tabShowPublishersBtn").classList.add("active");
        $("tabShowAuthorsBtn").classList.remove("active");
        $("publishersDirectoryBox").style.display = "block";
        $("authorsDirectoryBox").style.display = "none";
    });
}

document.querySelectorAll("[data-mylib]").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("[data-mylib]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const target = btn.getAttribute("data-mylib");
        document.querySelectorAll(".mylib-panel").forEach(p => {
            p.style.display = p.id === target ? "block" : "none";
        });
    });
});

document.querySelectorAll("[data-admintab]").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("[data-admintab]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const target = btn.getAttribute("data-admintab");
        document.querySelectorAll(".admin-panel").forEach(p => {
            p.style.display = p.id === target ? "block" : "none";
        });
    });
});

document.querySelectorAll(".modal-backdrop").forEach(modal => {
    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.style.display = "none";
            if (modal.id === "pdfReaderModal" && $("pdfViewerFrame")) {
                $("pdfViewerFrame").src = "";
            }
        }
    });
});

// ============================================================================
// 5. المصادقة، المزامنة السحابية للقراءة (Cloud Sync)، والقارئ الإلكتروني المطور
// ============================================================================
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    isAdmin = isUserAdmin(user);

    const authBtn = $("authActionBtn");
    if (user) {
        authBtn.innerHTML = `<i class="ri-logout-box-r-line"></i><span>تسجيل الخروج</span>`;
        authBtn.style.background = "var(--danger)";
        $("profileName").textContent = isAdmin ? `${user.displayName} (الإدارة العليا)` : user.displayName;
        $("profileEmail").textContent = user.email;
        $("profileAvatar").src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || "U")}&background=12221e&color=c5934c`;

        $("adminBadgeIcon").style.display = isAdmin ? "flex" : "none";
        $("adminNavBtn").style.display = isAdmin ? "flex" : "none";

        await loadUserDataAndSyncReading(user.uid);
    } else {
        authBtn.innerHTML = `<i class="ri-google-fill"></i><span>تسجيل الدخول بحساب جوجل</span>`;
        authBtn.style.background = "";
        $("profileName").textContent = "زائر مكتبة الحجرية";
        $("profileEmail").textContent = "سجل دخولك لمزامنة قراءاتك سحابياً وتوثيق المؤلفات والنشر الرقمي";
        $("profileAvatar").src = "https://ui-avatars.com/api/?name=H&background=12221e&color=c5934c";

        $("adminBadgeIcon").style.display = "none";
        $("adminNavBtn").style.display = "none";
        $("userContributorBadgeBox").style.display = "none";
        userFavorites = [];
    }
    renderAllViews();
});

if ($("authActionBtn")) {
    $("authActionBtn").addEventListener("click", () => {
        if (currentUser) {
            signOut(auth);
        } else {
            signInWithPopup(auth, new GoogleAuthProvider()).catch(err => {
                alert("يرجى التأكد من تفعيل Google في Firebase Authentication وإضافة النطاق في Authorized domains.");
                console.error(err);
            });
        }
    });
}

async function loadUserDataAndSyncReading(uid) {
    try {
        const ref = doc(db, "users", uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            const data = snap.data();
            userFavorites = data.favorites || [];
            // دمج سجل القراءة السحابي مع المحلي (الأحدث يفوز)
            const cloudProg = data.readingProgress || {};
            const merged = { ...userReadingProgress };
            Object.keys(cloudProg).forEach(bId => {
                if (!merged[bId] || (cloudProg[bId].updatedAt || 0) >= (merged[bId].updatedAt || 0)) {
                    merged[bId] = cloudProg[bId];
                }
            });
            userReadingProgress = merged;
            localStorage.setItem("hujariya_cloud_reading", JSON.stringify(userReadingProgress));
            await updateDoc(ref, { readingProgress: userReadingProgress });

            if (data.hideNotice) {
                localStorage.setItem("hujariya_hide_notice", "1");
                if ($("nonprofitNoticeBar")) $("nonprofitNoticeBar").style.display = "none";
            }
        } else {
            await setDoc(ref, {
                name: currentUser.displayName,
                email: currentUser.email,
                photoURL: currentUser.photoURL || "",
                favorites: [],
                readingProgress: userReadingProgress
            });
            userFavorites = [];
        }
    } catch (e) {
        console.error(e);
    }
}

async function saveCloudReadingState(book, pageNum, noteText) {
    if (!book) return;
    const prev = userReadingProgress[book.id] || {};
    userReadingProgress[book.id] = {
        bookId: book.id,
        bookTitle: book.title,
        author: book.author,
        coverUrl: book.coverUrl,
        page: pageNum !== undefined ? Math.max(1, parseInt(pageNum, 10) || 1) : (prev.page || 1),
        note: noteText !== undefined ? noteText : (prev.note || ""),
        updatedAt: Date.now()
    };
    localStorage.setItem("hujariya_cloud_reading", JSON.stringify(userReadingProgress));

    if (currentUser) {
        try {
            await updateDoc(doc(db, "users", currentUser.uid), {
                readingProgress: userReadingProgress
            });
        } catch (e) {}
    }
    renderQuickResumeBanner();
    if (currentUser) renderMyLibraryView();
}

// فتح القارئ الإلكتروني السحابي المطور من حيث توقف القارئ
function openCloudPdfReader(book) {
    if (!book || !book.downloadLink) return;
    currentReaderBook = book;
    const savedState = userReadingProgress[book.id] || { page: 1, note: "" };
    const startPage = savedState.page || 1;

    $("pdfReaderTitle").innerHTML = `<i class="ri-book-read-line"></i> ${escapeHtml(book.title)}`;
    $("readerCurrentPageInput").value = startPage;
    $("readerPersonalNoteInput").value = savedState.note || "";
    $("readerCloudNotesDrawer").style.display = "none";
    $("pdfViewerFrame").src = toEmbedDrivePreview(book.downloadLink, startPage);
    $("pdfReaderModal").style.display = "flex";

    // تسجيل فتح الكتاب في السحابة تلقائياً
    saveCloudReadingState(book, startPage, savedState.note || "");
}

if ($("saveCloudPageBtn")) {
    $("saveCloudPageBtn").onclick = async () => {
        if (!currentReaderBook) return;
        const page = parseInt($("readerCurrentPageInput").value, 10) || 1;
        await saveCloudReadingState(currentReaderBook, page, undefined);
        $("pdfViewerFrame").src = toEmbedDrivePreview(currentReaderBook.downloadLink, page);
        const badge = $("readerSyncBadge");
        if (badge) {
            badge.innerHTML = `<i class="ri-check-double-line"></i> حُفظت ص ${page} بالسحابة`;
            setTimeout(() => { badge.innerHTML = `<i class="ri-cloud-line"></i> متزامن سحابياً`; }, 2500);
        }
    };
}

if ($("toggleReaderNotesBtn")) {
    $("toggleReaderNotesBtn").onclick = () => {
        const drawer = $("readerCloudNotesDrawer");
        const isOpen = drawer.style.display !== "none";
        drawer.style.display = isOpen ? "none" : "block";
        $("toggleReaderNotesBtn").classList.toggle("active", !isOpen);
    };
}

if ($("saveReaderNoteBtn")) {
    $("saveReaderNoteBtn").onclick = async () => {
        if (!currentReaderBook) return;
        const note = $("readerPersonalNoteInput").value.trim();
        await saveCloudReadingState(currentReaderBook, undefined, note);
        $("saveReaderNoteBtn").textContent = "تم الحفظ ✓";
        setTimeout(() => { $("saveReaderNoteBtn").textContent = "حفظ بالسحابة"; }, 1800);
    };
}

if ($("toggleReaderNightFilterBtn")) {
    $("toggleReaderNightFilterBtn").onclick = () => {
        const wrap = $("pdfFrameWrapper");
        wrap.classList.toggle("night-filter-active");
        $("toggleReaderNightFilterBtn").classList.toggle("active", wrap.classList.contains("night-filter-active"));
    };
}

function getContributorRank(count) {
    if (count >= 15) return { title: "وسام حارس التراث العربي", icon: "ri-vip-crown-fill" };
    if (count >= 7) return { title: "وسام موثق الحجرية الذهبي", icon: "ri-medal-fill" };
    if (count >= 3) return { title: "وسام باحث وموثق", icon: "ri-award-fill" };
    if (count >= 1) return { title: "وسام مساهم ثقافي", icon: "ri-quill-pen-fill" };
    return { title: "قارئ ومشارك", icon: "ri-user-star-line" };
}

function updateUserBadge() {
    const box = $("userContributorBadgeBox");
    if (!currentUser || !box) return;
    const count = allBooks.filter(b =>
        b.addedByUid === currentUser.uid &&
        (b.status === "published_full" || b.status === "published_no_download")
    ).length;
    const rank = getContributorRank(count);
    box.style.display = "inline-flex";
    box.innerHTML = `<i class="${rank.icon}"></i><span>${rank.title} (${count})</span>`;
}

// ============================================================================
// 6. جلب البيانات الشاملة من Firestore وبناء شبكة العلاقات السحابية
// ============================================================================
async function fetchAllEncyclopediaData() {
    try {
        const [booksSnap, recordsSnap] = await Promise.all([
            getDocs(collection(db, "books")),
            getDocs(collection(db, "reviews"))
        ]);

        allReviews = [];
        allReviewReplies = [];
        allQuotes = [];
        allEditSuggestions = [];
        allAuthors = [];
        allPublishers = [];
        allReports = [];
        allAuditLogs = [];
        bookOverrides = {};

        recordsSnap.forEach(d => {
            const data = { id: d.id, ...d.data() };
            const type = data.recordType || "review";
            if (type === "author") allAuthors.push(data);
            else if (type === "publisher") allPublishers.push(data);
            else if (type === "report") allReports.push(data);
            else if (type === "audit") allAuditLogs.push(data);
            else if (type === "review_reply") allReviewReplies.push(data);
            else if (type === "quote") allQuotes.push(data);
            else if (type === "edit_suggestion") allEditSuggestions.push(data);
            else if (type === "book_override") {
                if (!bookOverrides[data.bookId] || data.createdAt > bookOverrides[data.bookId].createdAt) {
                    bookOverrides[data.bookId] = data;
                }
            } else {
                allReviews.push(data);
            }
        });

        const rawBooks = [];
        booksSnap.forEach(d => {
            const data = d.data();
            if (!data.isConfigDoc) {
                const bookObj = { id: d.id, ...data };
                if (bookOverrides[d.id]) {
                    const ov = bookOverrides[d.id];
                    Object.assign(bookObj, ov.updatedFields, { overrideDocId: ov.id });
                }
                rawBooks.push(bookObj);
            }
        });

        allBooks = rawBooks;
        allReports.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
        allAuditLogs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        allEditSuggestions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        syncImplicitEntities();
        populateDatalists();
        renderAllViews();

        if (!initialDeepLinkHandled) {
            initialDeepLinkHandled = true;
            handleUrlDeepLinks();
        }
    } catch (err) {
        console.error("خطأ في جلب بيانات المكتبة:", err);
    }
}

function handleUrlDeepLinks() {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const bookId = params.get("book") || hashParams.get("book");
    const authorName = params.get("author") || hashParams.get("author");
    const publisherName = params.get("publisher") || hashParams.get("publisher");

    if (bookId) {
        const targetBook = allBooks.find(b => b.id === bookId);
        if (targetBook) {
            openBookPage(targetBook);
            return;
        }
    }
    if (authorName) {
        openAuthorPage(authorName);
        return;
    }
    if (publisherName) {
        openPublisherPage(publisherName);
    }
}

window.addEventListener("popstate", () => handleUrlDeepLinks());

function syncImplicitEntities() {
    const knownAuthors = new Set(allAuthors.map(a => normalizeArabicIdentity(a.name)));
    allBooks.forEach(b => {
        const normA = normalizeArabicIdentity(b.author);
        if (normA && !knownAuthors.has(normA)) {
            knownAuthors.add(normA);
            allAuthors.push({
                id: "implicit_" + normA,
                isImplicit: true,
                name: b.author,
                authorType: b.authorRole === "self_author" || b.authorRole === "contemporary" ? "contemporary" : "public_figure",
                country: b.country || "اليمن",
                bio: b.authorBio || "مؤلف وعَلَم موثق في أرشيف مكتبة وموسوعة الحجرية.",
                photoUrl: b.authorPhotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.author)}&background=12221e&color=c5934c&size=200`,
                extraPublishers: [],
                userId: b.addedByUid || ""
            });
        }
    });

    const knownPubs = new Set(allPublishers.map(p => normalizeArabicIdentity(p.name)));
    allBooks.forEach(b => {
        if (b.publisher) {
            const normP = normalizeArabicIdentity(b.publisher);
            if (normP && !knownPubs.has(normP)) {
                knownPubs.add(normP);
                const bCountry = b.country || "اليمن";
                allPublishers.push({
                    id: "implicit_pub_" + normP,
                    isImplicit: true,
                    name: b.publisher,
                    country: bCountry,
                    scope: bCountry !== "اليمن" ? "عربية / خارجية" : "يمنية",
                    city: b.cityYear || bCountry,
                    bio: "دار نشر ومؤسسة ثقافية مدرجة ضمن الإصدارات الموثقة في مكتبة وموسوعة الحجرية.",
                    verified: false,
                    status: "approved",
                    userId: b.addedByUid || ""
                });
            }
        }
    });
}

function populateDatalists() {
    if ($("existingAuthorsDatalist")) {
        $("existingAuthorsDatalist").innerHTML = allAuthors.map(a => `<option value="${escapeHtml(a.name)}">`).join("");
    }
    if ($("existingPublishersDatalist")) {
        $("existingPublishersDatalist").innerHTML = allPublishers
            .filter(p => p.status !== "rejected")
            .map(p => `<option value="${escapeHtml(p.name)}">`).join("");
    }
}

// ============================================================================
// 7. عرض الرفوف، شريط استئناف القراءة السحابي، وتبويب «إصدارات الحجرية»
// ============================================================================
function renderAllViews() {
    updateTabCounters();
    updateUserBadge();
    renderQuickResumeBanner();
    renderMainBookshelf();
    renderAuthorsAndPublishersDirectory();
    renderMyLibraryView();
    if (isAdmin) renderAdminDashboard();
}

function renderQuickResumeBanner() {
    const banner = $("quickResumeReadingBanner");
    if (!banner) return;
    const entries = Object.values(userReadingProgress).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (entries.length === 0) {
        banner.style.display = "none";
        return;
    }
    const latest = entries[0];
    const targetBook = allBooks.find(b => b.id === latest.bookId);
    if (!targetBook || !targetBook.downloadLink) {
        banner.style.display = "none";
        return;
    }

    banner.style.display = "flex";
    banner.innerHTML = `
        <div class="resume-info">
            <img src="${escapeHtml(targetBook.coverUrl)}" alt="${escapeHtml(targetBook.title)}">
            <div>
                <span class="soft-tag"><i class="ri-cloud-line"></i> مزامنة القراءة السحابية</span>
                <h4 style="font-size:0.92rem; margin-top:3px;">${escapeHtml(targetBook.title)} — ${escapeHtml(targetBook.author)}</h4>
                <small class="muted-hint">توقفت عند الصفحة رقم <strong>(${latest.page || 1})</strong> ${latest.note ? `• لديك ملاحظة محفوظة` : ""}</small>
            </div>
        </div>
        <div style="display:flex; gap:8px;">
            <button type="button" id="quickResumeNowBtn" class="btn-primary-main" style="padding:8px 14px; font-size:0.8rem;">
                <i class="ri-play-fill"></i><span>متابعة من ص ${latest.page || 1}</span>
            </button>
        </div>
    `;
    $("quickResumeNowBtn").onclick = () => openCloudPdfReader(targetBook);
}

function updateTabCounters() {
    const published = allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download");
    const pressBooks = published.filter(b => b.publishMode === "hujariya_press");
    const yemeniBooks = published.filter(b => !b.country || b.country === "اليمن" || b.category === "تاريخ وتراث يمني");

    if ($("countCatAll")) $("countCatAll").textContent = published.length;
    if ($("countCatPress")) $("countCatPress").textContent = pressBooks.length;
    if ($("countCatYemen")) $("countCatYemen").textContent = yemeniBooks.length;
    if ($("dirAuthorsCountBadge")) $("dirAuthorsCountBadge").textContent = allAuthors.length;
    if ($("dirPublishersCountBadge")) {
        $("dirPublishersCountBadge").textContent = allPublishers.filter(p => p.status !== "rejected").length;
    }
}

if ($("searchInput")) {
    $("searchInput").addEventListener("input", (e) => {
        const val = e.target.value;
        $("clearSearchBtn").style.display = val ? "flex" : "none";
        if (val.trim().length > 1) {
            trackSilentSignal("query", val.trim());
            const shelvesEl = $("shelvesView");
            const authorsEl = $("authorsView");
            if (shelvesEl && !shelvesEl.classList.contains("active-page") && (!authorsEl || !authorsEl.classList.contains("active-page"))) {
                navigateToPage("shelvesView");
            }
        }
        renderMainBookshelf();
        renderAuthorsAndPublishersDirectory();
    });

    $("searchInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (!$("shelvesView").classList.contains("active-page")) navigateToPage("shelvesView");
            renderMainBookshelf();
        }
    });
}

if ($("clearSearchBtn")) {
    $("clearSearchBtn").addEventListener("click", () => {
        $("searchInput").value = "";
        $("clearSearchBtn").style.display = "none";
        renderMainBookshelf();
        renderAuthorsAndPublishersDirectory();
    });
}

document.querySelectorAll(".cat-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".cat-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        activeCategory = tab.getAttribute("data-cat");
        if (activeCategory !== "all" && activeCategory !== "yemeni_archive" && activeCategory !== "hujariya_press") {
            trackSilentSignal("categories", activeCategory, 1);
        }
        tab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        if (!$("shelvesView").classList.contains("active-page")) navigateToPage("shelvesView");
        renderMainBookshelf();
    });
});

document.querySelectorAll("#countryFilterBar .mini-pill").forEach(pill => {
    pill.addEventListener("click", () => {
        document.querySelectorAll("#countryFilterBar .mini-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        activeCountry = pill.getAttribute("data-country");
        if (activeCountry !== "all") trackSilentSignal("countries", activeCountry, 1);
        if (!$("shelvesView").classList.contains("active-page")) navigateToPage("shelvesView");
        renderMainBookshelf();
    });
});

document.querySelectorAll("#timelineFilterBar .mini-pill").forEach(pill => {
    pill.addEventListener("click", () => {
        document.querySelectorAll("#timelineFilterBar .mini-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        activeEra = pill.getAttribute("data-era");
        if (activeEra !== "all") trackSilentSignal("eras", activeEra, 1);
        if (!$("shelvesView").classList.contains("active-page")) navigateToPage("shelvesView");
        renderMainBookshelf();
    });
});

function renderMainBookshelf() {
    const rawQuery = ($("searchInput")?.value || "").trim();
    const grid = $("mainBookshelf");
    if (!grid) return;
    grid.innerHTML = "";

    const published = allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download");

    const filterBooks = (ignoreFiltersForSmartSearch = false) => {
        const results = [];
        for (const b of published) {
            const relevance = computeSmartSearchRelevance(b, rawQuery);
            if (relevance === 0) continue;

            if (!ignoreFiltersForSmartSearch) {
                const bCat = normalizeCategory(b.category);
                const bCountry = b.country || "اليمن";

                let matchCat = true;
                if (activeCategory === "hujariya_press") {
                    matchCat = b.publishMode === "hujariya_press";
                } else if (activeCategory === "yemeni_archive") {
                    matchCat = bCountry === "اليمن" || b.category === "تاريخ وتراث يمني";
                } else if (activeCategory === "صوت المؤلف") {
                    matchCat = Boolean(b.audioUrl);
                } else if (activeCategory !== "all") {
                    matchCat = bCat === activeCategory;
                }

                const matchCountry = activeCountry === "all" || bCountry === activeCountry;
                const matchEra = activeEra === "all" || (b.era || "الألفية الحديثة") === activeEra;

                if (!matchCat || !matchCountry || !matchEra) continue;
            }
            results.push({ book: b, relevance });
        }
        return results;
    };

    let matchedItems = filterBooks(false);
    if (rawQuery && matchedItems.length === 0 && (activeCategory !== "all" || activeCountry !== "all" || activeEra !== "all")) {
        matchedItems = filterBooks(true);
    }

    matchedItems.sort((a, b) => {
        if (rawQuery && b.relevance !== a.relevance) return b.relevance - a.relevance;
        return computeSilentBookScore(b.book) - computeSilentBookScore(a.book);
    });

    if (matchedItems.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:52px 20px; background:var(--bg-surface); border-radius:16px; border:1px dashed var(--border-color);">
                <i class="ri-vip-diamond-line" style="font-size:2.6rem; color:var(--accent);"></i>
                <h4 style="margin:8px 0 4px;">لا توجد مؤلفات في هذا القسم حالياً</h4>
                <p class="muted-hint">يمكنك المساهمة بتوثيق المؤلفات أو نشر إصدارك الرقمي عبر زر «نشر كتاب»</p>
            </div>
        `;
        return;
    }

    matchedItems.forEach(item => grid.appendChild(createCleanBookCard(item.book)));
}

// البطاقة الخارجية النظيفة (غلاف + عنوان + مؤلف فقط التزاماً بهوية المنصة)
function createCleanBookCard(book, showModerationState = false) {
    const card = document.createElement("div");
    card.className = "clean-book-card";

    let badgeHtml = "";
    if (showModerationState) {
        let stLabel = "مقبول";
        let stClass = "st-published";
        if (book.status === "pending") { stLabel = "⏳ قيد المراجعة"; stClass = "st-pending"; }
        else if (book.status === "suspended") { stLabel = "⚠️ معلق / مقيد"; stClass = "st-suspended"; }
        else if (book.status === "rejected") { stLabel = "❌ مرفوض"; stClass = "st-rejected"; }
        badgeHtml = `<span class="status-pill-floating ${stClass}">${stLabel}</span>`;
    }

    card.innerHTML = `
        <div class="clean-cover-wrap">
            <img src="${escapeHtml(book.coverUrl)}" alt="${escapeHtml(book.title)}" loading="lazy">
            ${badgeHtml}
        </div>
        <div class="clean-book-meta">
            <div class="clean-book-title">${escapeHtml(book.title)}</div>
            <div class="clean-book-author">${escapeHtml(book.author)}</div>
        </div>
    `;

    card.addEventListener("click", () => openBookPage(book));
    return card;
}

// ============================================================================
// 8. صفحة الكتاب المستقلة (شهادة إصدارات الحجرية، البطاقة الببليوغرافية، الاقتباسات، وفك الربط)
// ============================================================================
function canUserEditBook(book) {
    if (!currentUser) return false;
    if (isAdmin || book.addedByUid === currentUser.uid) return true;
    if (book.publisher) {
        const normP = normalizeArabicIdentity(book.publisher);
        return allPublishers.some(p => p.verified && p.userId === currentUser.uid && normalizeArabicIdentity(p.name) === normP);
    }
    return false;
}

function openBookPage(book) {
    currentOpenBook = book;
    trackSilentSignal("categories", normalizeCategory(book.category), 2);
    trackSilentSignal("authors", normalizeArabicIdentity(book.author), 3);
    trackSilentSignal("countries", book.country || "اليمن", 1.5);
    if (book.era) trackSilentSignal("eras", book.era, 1);

    updateSeoAndUrl({ book, pushUrl: true });
    navigateToPage("bookDetailPageView", true);

    const isFav = userFavorites.includes(book.id);
    const avg = book.ratingCount > 0 ? (book.ratingSum / book.ratingCount).toFixed(1) : "جديد";
    const bookReviews = allReviews.filter(r => r.bookId === book.id).sort((a, b) => b.createdAt - a.createdAt);
    const bookQuotes = allQuotes.filter(q => q.bookId === book.id).sort((a, b) => b.createdAt - a.createdAt);

    const contributorCount = allBooks.filter(b =>
        b.addedByUid === book.addedByUid &&
        (b.status === "published_full" || b.status === "published_no_download")
    ).length;
    const contributorRank = getContributorRank(contributorCount);
    const contributorAvatar = book.addedByPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(book.addedByName || "م")}&background=12221e&color=c5934c`;

    const hasDriveFile = book.status === "published_full" && Boolean(book.downloadLink);
    const userCanEdit = canUserEditBook(book);
    const isHujariyaPress = book.publishMode === "hujariya_press";
    const depositSerial = getBookDepositSerial(book);
    const savedRead = userReadingProgress[book.id];

    const linkedPublisherObj = book.publisher
        ? allPublishers.find(p => normalizeArabicIdentity(p.name) === normalizeArabicIdentity(book.publisher))
        : null;

    const directBookUrl = getBookDirectUrl(book.id);
    const pubYear = (book.cityYear && book.cityYear.match(/\d{4}/)?.[0]) || new Date(book.createdAt || Date.now()).getFullYear();
    const pubName = isHujariyaPress ? `إصدارات مكتبة وموسوعة الحجرية (${depositSerial})` : (book.publisher || "مكتبة وموسوعة الحجرية");
    const apaCitation = `${book.author}. (${pubYear}). ${book.title}. ${pubName}. مسترجع من: ${directBookUrl}`;
    const mlaCitation = `${book.author}. "${book.title}." ${pubName}، ${pubYear}. ${directBookUrl}`;
    const shareText = `📚 كتاب «${book.title}» للمؤلف «${book.author}»\nرقم التوثيق المرجعي: ${depositSerial}\nتصفح الكتاب في مكتبة وموسوعة الحجرية:\n${directBookUrl}`;

    const normAuth = normalizeArabicIdentity(book.author);
    const sameAuthorBooks = allBooks.filter(b =>
        b.id !== book.id &&
        (b.status === "published_full" || b.status === "published_no_download") &&
        normalizeArabicIdentity(b.author) === normAuth
    );
    const similarBooks = allBooks.filter(b =>
        b.id !== book.id &&
        (b.status === "published_full" || b.status === "published_no_download") &&
        normalizeArabicIdentity(b.author) !== normAuth &&
        normalizeCategory(b.category) === normalizeCategory(book.category)
    ).slice(0, 8);

    const container = $("bookPageContentContainer");
    container.innerHTML = `
        <div class="book-hero-card">
            <div class="book-hero-top">
                <img src="${escapeHtml(book.coverUrl)}" alt="${escapeHtml(book.title)}" class="book-hero-cover">
                <div class="book-hero-info">
                    <div class="book-tags-row">
                        ${isHujariyaPress ? `
                            <span class="press-exclusive-badge">
                                <i class="ri-vip-diamond-fill"></i> إصدار رقمي حصري • الحجرية
                            </span>
                        ` : ""}
                        <span class="soft-tag">${escapeHtml(normalizeCategory(book.category))}</span>
                        <span class="soft-tag"><i class="ri-earth-line"></i> ${escapeHtml(book.country || "اليمن")}</span>
                        <span class="soft-tag" style="font-family:monospace;">#${escapeHtml(depositSerial)}</span>
                        <span class="soft-tag" style="color:#d97706;">★ ${avg} (${book.ratingCount || 0})</span>
                    </div>

                    <h1>${escapeHtml(book.title)}</h1>

                    <div class="entity-chips-row">
                        <button type="button" id="pageAuthorChipBtn" class="author-link-chip" title="عرض صفحة المؤلف وجميع كتبه">
                            <i class="ri-quill-pen-fill" style="color:var(--accent);"></i>
                            <span>${escapeHtml(book.author)}</span>
                            <i class="ri-arrow-left-s-line"></i>
                        </button>

                        ${book.publisher ? `
                            <button type="button" id="pagePublisherChipBtn" class="author-link-chip" title="عرض صفحة دار النشر وإصداراتها">
                                <i class="ri-building-2-fill" style="color:var(--accent);"></i>
                                <span>${escapeHtml(book.publisher)}</span>
                                ${linkedPublisherObj?.verified ? `<i class="ri-verified-badge-fill" style="color:var(--accent);"></i>` : ""}
                                <i class="ri-arrow-left-s-line"></i>
                            </button>
                        ` : ""}
                    </div>

                    <div class="book-primary-actions">
                        ${hasDriveFile ? `
                            <button type="button" id="pageReadPdfBtn" class="btn-primary-main">
                                <i class="ri-book-read-fill"></i>
                                <span>${savedRead && savedRead.page > 1 ? `متابعة القراءة (ص ${savedRead.page})` : "قراءة الكتاب سحابياً"}</span>
                            </button>
                            <button type="button" id="pageDownloadPdfBtn" class="btn-accent-sm" style="padding:11px 16px; font-size:0.86rem;">
                                <i class="ri-download-cloud-2-line"></i><span>تحميل PDF</span>
                            </button>
                        ` : `
                            <span class="soft-tag" style="padding:8px 14px; background:var(--bg-elevated); color:var(--text-muted);">
                                <i class="ri-shield-keyhole-line"></i> بطاقة توثيق موسوعي (محمي بحقوق النشر)
                            </span>
                        `}

                        <button type="button" id="pageFavToggleBtn" class="btn-ghost-main">
                            <i class="${isFav ? 'ri-bookmark-fill' : 'ri-bookmark-line'}" style="color:var(--accent);"></i>
                            <span>${isFav ? 'محفوظ بمكتبتي' : 'حفظ'}</span>
                        </button>

                        ${userCanEdit ? `
                            <button type="button" id="pageEditBookBtn" class="btn-ghost-main">
                                <i class="ri-edit-2-line"></i><span>تعديل</span>
                            </button>
                        ` : ""}
                    </div>
                </div>
            </div>
        </div>

        <!-- القوائم المنسدلة (Accordions) لجميع تفاصيل وميزات الكتاب الموسوعية -->
        <div class="accordion-group">

            <!-- 1. وصف الكتاب وركن صوت المؤلف -->
            <details class="clean-accordion" open>
                <summary>
                    <span><i class="ri-file-text-line"></i> نبذة ووصف الكتاب ${book.audioUrl ? "• (مرفق مقطع صوتي)" : ""}</span>
                    <i class="ri-arrow-down-s-line acc-arrow"></i>
                </summary>
                <div class="accordion-body">
                    ${book.audioUrl ? `
                        <div style="background:var(--accent-soft); padding:10px 14px; border-radius:10px; margin-bottom:12px;">
                            <strong style="display:block; font-size:0.82rem; color:var(--accent); margin-bottom:5px;"><i class="ri-mic-2-fill"></i> ركن صوت المؤلف:</strong>
                            <audio controls src="${escapeHtml(book.audioUrl)}" style="width:100%; height:36px;"></audio>
                        </div>
                    ` : ""}
                    <p style="white-space:pre-line;">${escapeHtml(book.description)}</p>
                </div>
            </details>

            <!-- 2. البطاقة الببليوغرافية المعيارية وشهادة النشر الرقمي والإدارة -->
            <details class="clean-accordion" ${isHujariyaPress ? "open" : ""}>
                <summary>
                    <span><i class="ri-fingerprint-line"></i> البطاقة الببليوغرافية المعيارية ${isHujariyaPress ? "وشهادة إصدار الحجرية" : "وبيانات التوثيق"}</span>
                    <i class="ri-arrow-down-s-line acc-arrow"></i>
                </summary>
                <div class="accordion-body">
                    ${isHujariyaPress ? `
                        <div class="certificate-box">
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
                                <strong style="color:var(--accent); font-size:0.92rem; display:flex; align-items:center; gap:6px;">
                                    <i class="ri-vip-diamond-fill"></i> شهادة إيداع ونشر رقمي معتمد — إصدارات الحجرية
                                </strong>
                                <span class="certificate-serial">${escapeHtml(depositSerial)}</span>
                            </div>
                            <p class="muted-hint" style="color:var(--text-main); font-size:0.82rem;">
                                تُقرّ مكتبة وموسوعة الحجرية بأن هذا العمل منشور رقمياً وموثق ضمن سلسلة «إصدارات الحجرية» باسم المؤلف <strong>${escapeHtml(book.author)}</strong>، ويحمل البصمة المرجعية أعلاه لحفظ أسبقية النشر والحقوق الأدبية داخل الموسوعة ولدى محركات الفهرسة الأكاديمية.
                            </p>
                        </div>
                    ` : ""}

                    <div class="bibliographic-grid">
                        <div class="biblio-cell">
                            <small>الرقم المرجعي بالموسوعة</small>
                            <strong style="font-family:monospace; color:var(--accent);">${escapeHtml(depositSerial)}</strong>
                        </div>
                        <div class="biblio-cell">
                            <small>دار النشر / جهة الإصدار</small>
                            <strong id="accPublisherBox" style="cursor:${book.publisher ? 'pointer' : 'default'};">
                                ${escapeHtml(book.publisher || (isHujariyaPress ? "إصدارات مكتبة الحجرية" : "نشر خاص"))}
                            </strong>
                        </div>
                        <div class="biblio-cell">
                            <small>الرقم المعياري (ISBN)</small>
                            <strong>${escapeHtml(book.isbn || "غير مسجل")}</strong>
                        </div>
                        <div class="biblio-cell">
                            <small>عدد الصفحات</small>
                            <strong>${book.pagesCount ? `${escapeHtml(book.pagesCount)} صفحة` : "غير محدد"}</strong>
                        </div>
                        <div class="biblio-cell">
                            <small>البلد والمدينة وسنة النشر</small>
                            <strong>${escapeHtml(book.cityYear || book.country || "اليمن")}</strong>
                        </div>
                        <div class="biblio-cell">
                            <small>الحقبة الزمنية</small>
                            <strong>${escapeHtml(book.era || "الألفية الحديثة")}</strong>
                        </div>
                    </div>

                    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; background:var(--bg-main); padding:12px; border-radius:12px; border:1px solid var(--border-color);">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${escapeHtml(contributorAvatar)}" style="width:42px; height:42px; border-radius:50%; object-fit:cover; border:1.5px solid var(--accent);">
                            <div>
                                <strong style="font-size:0.86rem; display:block;">وثّقه المساهم: ${escapeHtml(book.addedByName || "باحث")}</strong>
                                <span style="font-size:0.75rem; color:var(--accent); font-weight:700;"><i class="${contributorRank.icon}"></i> ${contributorRank.title}</span>
                            </div>
                        </div>
                        <button type="button" id="pageReportBookBtn" class="btn-ghost-main" style="color:var(--danger); padding:6px 12px; font-size:0.78rem;">
                            <i class="ri-alarm-warning-line"></i> إبلاغ عن مشكلة / حقوق
                        </button>
                    </div>

                    ${isAdmin ? `
                        <div style="margin-top:12px; padding:12px; border:1.5px dashed var(--accent); border-radius:12px; background:var(--accent-soft);">
                            <strong style="display:block; font-size:0.84rem; margin-bottom:8px;"><i class="ri-vip-crown-fill"></i> غرفة تحكم الإدارة وفك/إعادة الربط السحابي:</strong>
                            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                                <button type="button" id="admManageLinksBtn" class="btn-primary-main" style="padding:7px 12px; font-size:0.78rem;">
                                    <i class="ri-links-fill"></i> فك / نقل ارتباط المؤلف أو الدار
                                </button>
                                <button type="button" id="admTogglePressModeBtn" class="btn-accent-sm">
                                    <i class="ri-vip-diamond-line"></i> ${isHujariyaPress ? "إلغاء شارة إصدارات الحجرية" : "ترقية لإصدارات الحجرية (HJ-PUB)"}
                                </button>
                                <button type="button" id="admQuickToggleDl" class="btn-ghost-main" style="padding:7px 12px; font-size:0.76rem;">
                                    ${book.status === 'published_full' ? 'إيقاف التحميل' : 'تفعيل التحميل'}
                                </button>
                                <button type="button" id="admQuickSuspend" class="btn-accent-sm" style="background:var(--warning);">
                                    ${book.status === 'suspended' ? 'إلغاء التعليق' : 'تعليق مؤقت'}
                                </button>
                                <button type="button" id="admQuickDelete" class="btn-primary-main" style="background:var(--danger); padding:7px 12px; font-size:0.76rem;">
                                    حذف نهائي
                                </button>
                            </div>
                        </div>
                    ` : ""}
                </div>
            </details>

            <!-- 3. ركن قبسات واقتباسات من الكتاب (يزيد ثراء SEO والتفاعل الثقافي) -->
            <details class="clean-accordion">
                <summary>
                    <span><i class="ri-Chat-quote-fill"></i> قبسات واقتباسات من الكتاب (${bookQuotes.length})</span>
                    <i class="ri-arrow-down-s-line acc-arrow"></i>
                </summary>
                <div class="accordion-body">
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
                        <input type="text" id="newQuoteTextInput" placeholder="أضف اقتباساً أو نصاً مميزاً من هذا الكتاب..." style="flex:1; min-width:200px; padding:9px 12px; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main);">
                        <input type="number" id="newQuotePageInput" placeholder="ص" style="width:74px; padding:9px; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main); text-align:center;">
                        <button type="button" id="submitQuoteBtn" class="btn-accent-sm" style="padding:9px 14px;">
                            <i class="ri-add-line"></i> إضافة اقتباس
                        </button>
                    </div>
                    <div id="bookQuotesListContainer">
                        ${bookQuotes.length === 0 ? `<p class="muted-hint">لا توجد اقتباسات مضافة بعد. شاركنا أجمل عبارة قرأتها في هذا الكتاب!</p>` : bookQuotes.map(qt => `
                            <blockquote class="quote-card">
                                «${escapeHtml(qt.quoteText)}»
                                <footer>
                                    <span>${qt.pageNum ? `الصفحة (${escapeHtml(qt.pageNum)})` : "مقتبس من الكتاب"}</span>
                                    <span>بواسطة: ${escapeHtml(qt.userName || "قارئ")}</span>
                                </footer>
                            </blockquote>
                        `).join("")}
                    </div>
                </div>
            </details>

            <!-- 4. الاستشهاد الأكاديمي المرجعي (APA / MLA) والمشاركة -->
            <details class="clean-accordion">
                <summary>
                    <span><i class="ri-double-quotes-r"></i> الاستشهاد الأكاديمي المرجعي (APA / MLA) والمشاركة</span>
                    <i class="ri-arrow-down-s-line acc-arrow"></i>
                </summary>
                <div class="accordion-body">
                    <div style="background:var(--bg-main); padding:11px; border-radius:10px; margin-bottom:10px; border:1px solid var(--border-color);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <strong style="font-size:0.8rem; color:var(--accent);">صيغة (APA) القياسية:</strong>
                            <button type="button" id="copyApaDirectBtn" class="btn-ghost-main" style="padding:4px 10px; font-size:0.74rem;">
                                <i class="ri-file-copy-line"></i> نسخ APA
                            </button>
                        </div>
                        <p style="font-size:0.82rem; word-break:break-all;">${escapeHtml(apaCitation)}</p>
                    </div>

                    <div style="background:var(--bg-main); padding:11px; border-radius:10px; margin-bottom:12px; border:1px solid var(--border-color);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <strong style="font-size:0.8rem; color:var(--accent);">صيغة (MLA) الأدبية:</strong>
                            <button type="button" id="copyMlaDirectBtn" class="btn-ghost-main" style="padding:4px 10px; font-size:0.74rem;">
                                <i class="ri-file-copy-line"></i> نسخ MLA
                            </button>
                        </div>
                        <p style="font-size:0.82rem; word-break:break-all;">${escapeHtml(mlaCitation)}</p>
                    </div>

                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <a href="https://wa.me/?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener" class="btn-primary-main" style="flex:1; background:#25D366; text-decoration:none; padding:8px;">
                            <i class="ri-whatsapp-line"></i> واتساب
                        </a>
                        <a href="https://t.me/share/url?url=${encodeURIComponent(directBookUrl)}&text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener" class="btn-primary-main" style="flex:1; background:#0088cc; text-decoration:none; padding:8px;">
                            <i class="ri-telegram-line"></i> تيليجرام
                        </a>
                        <button type="button" id="copyRawBookUrlBtn" class="btn-ghost-main" style="flex:1;">
                            <i class="ri-link"></i> نسخ رابط الكتاب
                        </button>
                    </div>
                </div>
            </details>

            <!-- 5. المراجعات والنقاشات والردود التفاعلية (Threaded Replies) -->
            <details class="clean-accordion" open>
                <summary>
                    <span><i class="ri-chat-quote-line"></i> المراجعات والنقاشات التفاعلية (${bookReviews.length})</span>
                    <i class="ri-arrow-down-s-line acc-arrow"></i>
                </summary>
                <div class="accordion-body">
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
                        <select id="newReviewStars" style="padding:9px; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main); font-weight:700;">
                            <option value="5">★★★★★ (5)</option>
                            <option value="4">★★★★ (4)</option>
                            <option value="3">★★★ (3)</option>
                            <option value="2">★★ (2)</option>
                            <option value="1">★ (1)</option>
                        </select>
                        <input type="text" id="newReviewComment" placeholder="اكتب مراجعتك أو مساهمتك النقدية حول الكتاب..." style="flex:1; min-width:180px; padding:9px 12px; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main);">
                        <button type="button" id="submitReviewBtn" class="btn-primary-main" style="padding:9px 16px;">
                            <i class="ri-send-plane-2-fill"></i><span>نشر</span>
                        </button>
                    </div>

                    <div id="bookReviewsThreadContainer" class="reviews-thread-list"></div>
                </div>
            </details>

        </div>

        ${sameAuthorBooks.length > 0 ? `
            <div class="linked-shelf-box">
                <h3><i class="ri-quill-pen-line"></i> مؤلفات أخرى للكاتب «${escapeHtml(book.author)}»</h3>
                <div class="horizontal-scroll-shelf" id="sameAuthorShelf"></div>
            </div>
        ` : ""}

        ${similarBooks.length > 0 ? `
            <div class="linked-shelf-box">
                <h3><i class="ri-compass-3-line"></i> مؤلفات ذات صلة في «${escapeHtml(normalizeCategory(book.category))}»</h3>
                <div class="horizontal-scroll-shelf" id="similarBooksShelf"></div>
            </div>
        ` : ""}
    `;

    renderReviewsWithReplies(book, bookReviews);

    const fillMiniShelf = (list, elId) => {
        const el = $(elId);
        if (!el) return;
        list.forEach(item => {
            const d = document.createElement("div");
            d.className = "mini-book-card";
            d.innerHTML = `
                <img src="${escapeHtml(item.coverUrl)}" alt="${escapeHtml(item.title)}">
                <h5>${escapeHtml(item.title)}</h5>
            `;
            d.onclick = () => openBookPage(item);
            el.appendChild(d);
        });
    };
    fillMiniShelf(sameAuthorBooks, "sameAuthorShelf");
    fillMiniShelf(similarBooks, "similarBooksShelf");

    $("pageAuthorChipBtn").onclick = () => openAuthorPage(book.author);
    if ($("pagePublisherChipBtn")) $("pagePublisherChipBtn").onclick = () => openPublisherPage(book.publisher);
    if (book.publisher && $("accPublisherBox")) $("accPublisherBox").onclick = () => openPublisherPage(book.publisher);

    if ($("suggestBookEditBtn")) {
        $("suggestBookEditBtn").onclick = () => openCrowdsourcedEditSuggestionModal(book);
    }

    if ($("shareBookDirectLinkBtn")) {
        $("shareBookDirectLinkBtn").onclick = async () => {
            if (navigator.share) {
                try { await navigator.share({ title: book.title, text: shareText, url: directBookUrl }); return; } catch (e) {}
            }
            navigator.clipboard.writeText(directBookUrl);
            alert("تم نسخ الرابط المباشر للكتاب!");
        };
    }

    if ($("pageReadPdfBtn")) {
        $("pageReadPdfBtn").onclick = () => openCloudPdfReader(book);
    }

    if ($("pageDownloadPdfBtn")) {
        $("pageDownloadPdfBtn").onclick = () => {
            $("confirmDownloadBookTitle").textContent = `${book.title} - ${book.author}`;
            $("confirmDirectDownloadLink").href = toDirectDriveDownload(book.downloadLink);
            $("confirmDownloadModal").style.display = "flex";
        };
    }

    $("pageFavToggleBtn").onclick = async () => {
        if (!currentUser) return alert("يرجى تسجيل الدخول لحفظ الكتب في مكتبتك.");
        if (isFav) userFavorites = userFavorites.filter(id => id !== book.id);
        else userFavorites.push(book.id);
        await updateDoc(doc(db, "users", currentUser.uid), { favorites: userFavorites });
        openBookPage(book);
    };

    if ($("pageEditBookBtn")) $("pageEditBookBtn").onclick = () => openBookFormModal(book);
    $("pageReportBookBtn").onclick = () => openReportTicketModal(book, null);

    $("copyApaDirectBtn").onclick = () => {
        navigator.clipboard.writeText(apaCitation);
        $("copyApaDirectBtn").innerHTML = `<i class="ri-check-line"></i> تم النسخ`;
    };
    $("copyMlaDirectBtn").onclick = () => {
        navigator.clipboard.writeText(mlaCitation);
        $("copyMlaDirectBtn").innerHTML = `<i class="ri-check-line"></i> تم النسخ`;
    };
    $("copyRawBookUrlBtn").onclick = () => {
        navigator.clipboard.writeText(directBookUrl);
        $("copyRawBookUrlBtn").innerHTML = `<i class="ri-check-line"></i> تم نسخ الرابط`;
    };

    // إضافة اقتباس للكتاب
    $("submitQuoteBtn").onclick = async () => {
        if (!currentUser) return alert("يرجى تسجيل الدخول لإضافة اقتباس.");
        const quoteText = $("newQuoteTextInput").value.trim();
        const pageNum = $("newQuotePageInput").value.trim();
        if (!quoteText) return;
        $("submitQuoteBtn").disabled = true;

        await addDoc(collection(db, "reviews"), {
            recordType: "quote",
            bookId: book.id,
            bookTitle: book.title,
            userId: currentUser.uid,
            userName: currentUser.displayName,
            quoteText,
            pageNum,
            createdAt: Date.now()
        });
        await fetchAllEncyclopediaData();
        const updated = allBooks.find(b => b.id === book.id);
        if (updated) openBookPage(updated);
    };

    $("submitReviewBtn").onclick = async () => {
        if (!currentUser) return alert("يرجى تسجيل الدخول لإضافة مراجعة.");
        const stars = parseInt($("newReviewStars").value, 10);
        const comment = $("newReviewComment").value.trim();
        if (!comment) return;

        await addDoc(collection(db, "reviews"), {
            recordType: "review",
            bookId: book.id,
            userId: currentUser.uid,
            userName: currentUser.displayName,
            stars,
            comment,
            createdAt: Date.now()
        });

        const newSum = (book.ratingSum || 0) + stars;
        const newCount = (book.ratingCount || 0) + 1;
        await updateDoc(doc(db, "books", book.id), { ratingSum: newSum, ratingCount: newCount });
        await fetchAllEncyclopediaData();
        const updated = allBooks.find(b => b.id === book.id);
        if (updated) openBookPage(updated);
    };

    if (isAdmin) {
        $("admManageLinksBtn").onclick = () => openAdminBookRelinkModal(book);

        $("admTogglePressModeBtn").onclick = async () => {
            const nextMode = isHujariyaPress ? "archive" : "hujariya_press";
            const newSerial = getBookDepositSerial({ ...book, publishMode: nextMode, depositSerial: "" });
            await updateDoc(doc(db, "books", book.id), {
                publishMode: nextMode,
                depositSerial: newSerial
            });
            await recordAuditLog("تغيير وضع إصدار الحجرية", `${book.title} (${newSerial})`);
            await fetchAllEncyclopediaData();
            const updated = allBooks.find(b => b.id === book.id);
            if (updated) openBookPage(updated);
        };

        $("admQuickToggleDl").onclick = async () => {
            if (book.status === "published_full") {
                await updateDoc(doc(db, "books", book.id), { status: "published_no_download" });
            } else {
                const link = book.downloadLink || prompt("أدخل رابط Google Drive لتفعيل القراءة والتحميل:");
                if (!link) return;
                await updateDoc(doc(db, "books", book.id), { status: "published_full", downloadLink: link.trim() });
            }
            await recordAuditLog("تغيير حالة تحميل كتاب", book.title);
            await fetchAllEncyclopediaData();
            const updated = allBooks.find(b => b.id === book.id);
            if (updated) openBookPage(updated);
        };

        $("admQuickSuspend").onclick = async () => {
            const nextSt = book.status === "suspended"
                ? (book.downloadLink ? "published_full" : "published_no_download")
                : "suspended";
            await updateDoc(doc(db, "books", book.id), { status: nextSt });
            await recordAuditLog("تعليق / فك تقييد كتاب", book.title);
            await fetchAllEncyclopediaData();
            const updated = allBooks.find(b => b.id === book.id);
            if (updated) openBookPage(updated);
        };

        $("admQuickDelete").onclick = async () => {
            if (confirm(`تأكيد الحذف النهائي لكتاب «${book.title}»؟`)) {
                await deleteDoc(doc(db, "books", book.id));
                await recordAuditLog("حذف نهائي لكتاب", book.title);
                navigateToPage("shelvesView");
                await fetchAllEncyclopediaData();
            }
        };
    }
}

// نافذة اقتراح إثراء أو تعديل بيانات كتاب من قِبل الجمهور (تحال للإدارة للموافقة بضغطة زر)
function openCrowdsourcedEditSuggestionModal(book) {
    if (!currentUser) {
        alert("يرجى تسجيل الدخول لاقتراح إثراء أو تصحيح بيانات هذا الكتاب.");
        navigateToPage("profileView");
        return;
    }

    $("addEntityModalTitle").innerHTML = `<i class="ri-edit-circle-line"></i> اقتراح إثراء أو تصحيح بيانات الكتاب`;
    $("addEntityModalBody").innerHTML = `
        <p class="muted-hint" style="margin-bottom:12px;">ساهم معنا في إثراء الموسوعة؛ راجع البيانات الحالية وعدّل ما يلزم ليعتمدها المشرف بضغطة واحدة:</p>
        <div class="input-group">
            <label>عنوان الكتاب</label>
            <input type="text" id="sugTitleInput" value="${escapeHtml(book.title)}">
        </div>
        <div class="grid-2col">
            <div class="input-group">
                <label>اسم المؤلف</label>
                <input type="text" id="sugAuthorInput" list="existingAuthorsDatalist" value="${escapeHtml(book.author)}">
            </div>
            <div class="input-group">
                <label>دار النشر</label>
                <input type="text" id="sugPubInput" list="existingPublishersDatalist" value="${escapeHtml(book.publisher || "")}">
            </div>
        </div>
        <div class="grid-2col">
            <div class="input-group">
                <label>المدينة وسنة النشر</label>
                <input type="text" id="sugCityYearInput" value="${escapeHtml(book.cityYear || "")}">
            </div>
            <div class="input-group">
                <label>عدد الصفحات</label>
                <input type="number" id="sugPagesInput" value="${escapeHtml(book.pagesCount || "")}">
            </div>
        </div>
        <div class="input-group">
            <label>الرقم المعياري (ISBN)</label>
            <input type="text" id="sugIsbnInput" value="${escapeHtml(book.isbn || "")}">
        </div>
        <div class="input-group">
            <label>إثراء وصف الكتاب</label>
            <textarea id="sugDescInput" rows="3">${escapeHtml(book.description || "")}</textarea>
        </div>
        <button type="button" id="sendEditSuggestionBtn" class="btn-primary-main w-100">إرسال المقترح للإدارة</button>
    `;

    $("sendEditSuggestionBtn").onclick = async () => {
        $("sendEditSuggestionBtn").disabled = true;
        const proposedFields = {
            title: $("sugTitleInput").value.trim() || book.title,
            author: $("sugAuthorInput").value.trim() || book.author,
            publisher: $("sugPubInput").value.trim(),
            cityYear: $("sugCityYearInput").value.trim(),
            pagesCount: $("sugPagesInput").value.trim(),
            isbn: $("sugIsbnInput").value.trim(),
            description: $("sugDescInput").value.trim() || book.description
        };

        await addDoc(collection(db, "reviews"), {
            recordType: "edit_suggestion",
            bookId: book.id,
            bookTitle: book.title,
            userId: currentUser.uid,
            userName: currentUser.displayName,
            proposedFields,
            status: "pending",
            createdAt: Date.now()
        });

        await fetchAllEncyclopediaData();
        $("addEntityModal").style.display = "none";
        alert("شكراً لمساهمتك! تم إرسال التعديل لغرفة الإدارة لاعتماده.");
    };

    $("addEntityModal").style.display = "flex";
}

// أداة فك وإعادة الربط السريع للإدارة (فك ارتباط كتاب بمؤلف أو دار نشر ونقله فوراً)
function openAdminBookRelinkModal(book) {
    $("addEntityModalTitle").innerHTML = `<i class="ri-links-fill"></i> إدارة الارتباطات السحابية وفك الربط`;
    $("addEntityModalBody").innerHTML = `
        <div class="collapsible-subbox" style="margin-bottom:14px;">
            <strong>الكتاب المحدد:</strong> ${escapeHtml(book.title)}
        </div>
        <div class="input-group">
            <label>نقل أو تغيير المؤلف المرتبط بهذا الكتاب *</label>
            <input type="text" id="relinkAuthorInput" list="existingAuthorsDatalist" value="${escapeHtml(book.author)}">
        </div>
        <div class="input-group">
            <div class="label-split">
                <label>دار النشر المرتبطة بهذا الكتاب</label>
                <button type="button" id="unlinkPublisherClearBtn" class="link-action-btn" style="color:var(--danger);">
                    <i class="ri-link-unlink-m"></i> فك الارتباط من دار النشر نهائياً
                </button>
            </div>
            <input type="text" id="relinkPublisherInput" list="existingPublishersDatalist" value="${escapeHtml(book.publisher || "")}" placeholder="لا توجد دار نشر مرتبطة">
        </div>
        <button type="button" id="saveAdminRelinkBtn" class="btn-primary-main w-100">حفظ وتحديث الارتباطات فوراً</button>
    `;

    $("unlinkPublisherClearBtn").onclick = () => {
        $("relinkPublisherInput").value = "";
    };

    $("saveAdminRelinkBtn").onclick = async () => {
        const newAuthor = $("relinkAuthorInput").value.trim();
        const newPub = $("relinkPublisherInput").value.trim();
        if (!newAuthor) return alert("لا يمكن ترك الكتاب بدون مؤلف.");
        $("saveAdminRelinkBtn").disabled = true;

        await updateDoc(doc(db, "books", book.id), {
            author: newAuthor,
            publisher: newPub,
            updatedAt: Date.now()
        });
        await recordAuditLog("تعديل ارتباطات كتاب", `${book.title} -> المؤلف: ${newAuthor} | الدار: ${newPub || "بدون"}`);
        await fetchAllEncyclopediaData();
        $("addEntityModal").style.display = "none";
        const updated = allBooks.find(b => b.id === book.id);
        if (updated) openBookPage(updated);
    };

    $("addEntityModal").style.display = "flex";
}

function renderReviewsWithReplies(book, bookReviews) {
    const container = $("bookReviewsThreadContainer");
    if (!container) return;
    container.innerHTML = "";

    if (bookReviews.length === 0) {
        container.innerHTML = `<p class="muted-hint">لا توجد مراجعات بعد، كن أول من يفتتح النقاش حول هذا الكتاب.</p>`;
        return;
    }

    bookReviews.forEach(rev => {
        const replies = allReviewReplies
            .filter(rep => rep.parentReviewId === rev.id)
            .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

        const item = document.createElement("div");
        item.className = "review-thread-item";
        item.innerHTML = `
            <div class="review-head">
                <span><i class="ri-user-smile-line" style="color:var(--accent);"></i> ${escapeHtml(rev.userName)}</span>
                <span style="color:#d97706;">${"★".repeat(rev.stars || 5)}</span>
            </div>
            <div class="review-body-text">${escapeHtml(rev.comment)}</div>
            <div class="review-actions-bar">
                <button type="button" class="reply-trigger-btn">
                    <i class="ri-reply-line"></i> رد على المساهمة (${replies.length})
                </button>
            </div>
            <div class="replies-nested-box" style="display:${replies.length > 0 ? 'flex' : 'none'};">
                ${replies.map(rp => `
                    <div class="reply-item">
                        <strong style="color:var(--accent); display:block; font-size:0.76rem;">
                            <i class="ri-corner-down-left-line"></i> ${escapeHtml(rp.userName)}
                        </strong>
                        <span>${escapeHtml(rp.replyText)}</span>
                    </div>
                `).join("")}
                <div class="inline-reply-form" style="display:none;">
                    <input type="text" placeholder="اكتب ردك على ${escapeHtml(rev.userName)}...">
                    <button type="button" class="btn-accent-sm">إرسال</button>
                </div>
            </div>
        `;

        const triggerBtn = item.querySelector(".reply-trigger-btn");
        const nestedBox = item.querySelector(".replies-nested-box");
        const replyForm = item.querySelector(".inline-reply-form");
        const replyInput = replyForm.querySelector("input");
        const replySendBtn = replyForm.querySelector("button");

        triggerBtn.onclick = () => {
            nestedBox.style.display = "flex";
            const isFormVisible = replyForm.style.display !== "none";
            replyForm.style.display = isFormVisible ? "none" : "flex";
            if (!isFormVisible) replyInput.focus();
        };

        replySendBtn.onclick = async () => {
            if (!currentUser) return alert("يرجى تسجيل الدخول للرد على المساهمات.");
            const text = replyInput.value.trim();
            if (!text) return;
            replySendBtn.disabled = true;

            await addDoc(collection(db, "reviews"), {
                recordType: "review_reply",
                bookId: book.id,
                parentReviewId: rev.id,
                userId: currentUser.uid,
                userName: currentUser.displayName,
                replyText: text,
                createdAt: Date.now()
            });

            await fetchAllEncyclopediaData();
            const updatedBook = allBooks.find(b => b.id === book.id);
            if (updatedBook) openBookPage(updatedBook);
        };

        container.appendChild(item);
    });
}

if ($("closePdfReaderModal")) {
    $("closePdfReaderModal").onclick = () => {
        $("pdfReaderModal").style.display = "none";
        $("pdfViewerFrame").src = "";
    };
}
if ($("closeConfirmDownload")) $("closeConfirmDownload").onclick = () => $("confirmDownloadModal").style.display = "none";
if ($("cancelDownloadBtn")) $("cancelDownloadBtn").onclick = () => $("confirmDownloadModal").style.display = "none";
if ($("confirmDirectDownloadLink")) {
    $("confirmDirectDownloadLink").onclick = () => setTimeout(() => $("confirmDownloadModal").style.display = "none", 400);
}

// ============================================================================
// 9. صفحات المؤلفين ودور النشر المستقلة (مع الربط التبادلي وإضافة كتب للمؤلف)
// ============================================================================
function openAuthorPage(authorName) {
    const normTarget = normalizeArabicIdentity(authorName);
    let authorObj = allAuthors.find(a => normalizeArabicIdentity(a.name) === normTarget);
    if (!authorObj) {
        authorObj = {
            id: "implicit_" + normTarget,
            isImplicit: true,
            name: authorName,
            authorType: "public_figure",
            country: "اليمن",
            bio: "مؤلف وعَلَم موثق في مكتبة وموسوعة الحجرية.",
            photoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=12221e&color=c5934c`,
            extraPublishers: [],
            userId: ""
        };
    }

    trackSilentSignal("authors", normTarget, 2);
    updateSeoAndUrl({ author: authorObj, pushUrl: true });
    navigateToPage("authorDetailPageView", true);

    const authorBooks = allBooks.filter(b =>
        normalizeArabicIdentity(b.author) === normTarget &&
        (b.status === "published_full" || b.status === "published_no_download")
    );

    // استنتاج جميع دور النشر التي نشر معها المؤلف تلقائياً + الدور المربوطة يدوياً
    const pubSet = new Map();
    authorBooks.forEach(b => {
        if (b.publisher) pubSet.set(normalizeArabicIdentity(b.publisher), b.publisher);
    });
    (authorObj.extraPublishers || []).forEach(pName => {
        if (pName) pubSet.set(normalizeArabicIdentity(pName), pName);
    });
    const associatedPublishers = Array.from(pubSet.values());

    const canEditAuthor = isAdmin || (currentUser && authorObj.userId && authorObj.userId === currentUser.uid);
    const isPublicFigure = (authorObj.authorType || "public_figure") === "public_figure";
    const photo = authorObj.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorObj.name)}&background=12221e&color=c5934c`;

    const container = $("authorPageContentContainer");
    container.innerHTML = `
        <div class="book-hero-card">
            <div style="display:flex; gap:18px; align-items:center; flex-wrap:wrap;">
                <img src="${escapeHtml(photo)}" style="width:94px; height:94px; border-radius:50%; object-fit:cover; border:2.5px solid var(--accent);">
                <div style="flex:1; min-width:210px;">
                    <div class="book-tags-row">
                        <span class="soft-tag">
                            <i class="${isPublicFigure ? 'ri-ancient-pavilion-line' : 'ri-quill-pen-line'}"></i>
                            ${isPublicFigure ? "شخصية عامة / عَلَم" : "مؤلف معاصر"}
                        </span>
                        <span class="soft-tag"><i class="ri-earth-line"></i> ${escapeHtml(authorObj.country || "اليمن")}</span>
                        <span class="soft-tag">${authorBooks.length} مؤلفات</span>
                    </div>

                    <h2 style="font-family:'Amiri',serif; font-size:1.7rem; margin:6px 0;">${escapeHtml(authorObj.name)}</h2>
                    <p class="muted-hint" style="color:var(--text-main); line-height:1.75;">${escapeHtml(authorObj.bio)}</p>

                    <!-- أزرار التفاعل السحابي المباشر في صفحة المؤلف -->
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
                        <button type="button" id="addBookForThisAuthorBtn" class="btn-primary-main" style="padding:8px 15px; font-size:0.82rem;">
                            <i class="ri-add-circle-line"></i>
                            <span>أضف كتاباً لـ «${escapeHtml(authorObj.name)}»</span>
                        </button>

                        ${canEditAuthor ? `
                            <button type="button" id="editAuthorPageBtn" class="btn-ghost-main" style="padding:8px 13px; font-size:0.8rem;">
                                <i class="ri-edit-line"></i> تحديث السيرة / الصورة
                            </button>
                        ` : ""}

                        ${isAdmin ? `
                            <button type="button" id="adminLinkAuthorPubsBtn" class="btn-accent-sm" style="padding:8px 13px; font-size:0.8rem;">
                                <i class="ri-links-line"></i> ربط / فك دور نشر للمؤلف
                            </button>
                        ` : ""}
                    </div>
                </div>
            </div>

            ${associatedPublishers.length > 0 ? `
                <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border-color);">
                    <small class="muted-hint" style="display:block; margin-bottom:6px;"><i class="ri-building-2-line"></i> دور النشر التي صدرت عنها أعمال المؤلف:</small>
                    <div class="entity-chips-row" id="authorAssociatedPubsRow" style="margin-bottom:0;"></div>
                </div>
            ` : ""}
        </div>

        <h3 style="font-size:1.05rem; margin-bottom:14px; display:flex; align-items:center; gap:6px;">
            <i class="ri-book-2-line" style="color:var(--accent);"></i>
            <span>مؤلفات «${escapeHtml(authorObj.name)}» الموثقة (${authorBooks.length})</span>
        </h3>
        <div id="authorPageBooksGrid" class="clean-books-grid"></div>
    `;

    const pubsRow = $("authorAssociatedPubsRow");
    if (pubsRow) {
        associatedPublishers.forEach(pName => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "author-link-chip";
            btn.innerHTML = `<i class="ri-building-line" style="color:var(--accent);"></i><span>${escapeHtml(pName)}</span>`;
            btn.onclick = () => openPublisherPage(pName);
            pubsRow.appendChild(btn);
        });
    }

    const grid = $("authorPageBooksGrid");
    if (authorBooks.length === 0) {
        grid.innerHTML = `<p class="muted-hint">لا توجد مؤلفات منشورة حالياً. اضغط «أضف كتاباً» للمساهمة بتوثيق أعماله.</p>`;
    } else {
        authorBooks.forEach(b => grid.appendChild(createCleanBookCard(b)));
    }

    // فتح نافذة نشر كتاب مربوط مسبقاً بهذا المؤلف مع التحقق الصارم من التكرار
    $("addBookForThisAuthorBtn").onclick = () => {
        openBookFormModal(null, { presetAuthor: authorObj.name, presetCountry: authorObj.country, presetRole: authorObj.authorType || "public_figure" });
    };

    if (canEditAuthor && $("editAuthorPageBtn")) {
        $("editAuthorPageBtn").onclick = () => openAddOrEditAuthorModal(authorObj);
    }

    if (isAdmin && $("adminLinkAuthorPubsBtn")) {
        $("adminLinkAuthorPubsBtn").onclick = () => openAdminAuthorPublishersLinkModal(authorObj, associatedPublishers);
    }

    if ($("shareAuthorDirectLinkBtn")) {
        $("shareAuthorDirectLinkBtn").onclick = async () => {
            const url = getAuthorDirectUrl(authorObj.name);
            if (navigator.share) {
                try { await navigator.share({ title: authorObj.name, url }); return; } catch (e) {}
            }
            navigator.clipboard.writeText(url);
            alert("تم نسخ الرابط المباشر لصفحة المؤلف!");
        };
    }
}

// نافذة ربط أو فك ارتباط مؤلف بدور نشر إضافية (للإدارة)
function openAdminAuthorPublishersLinkModal(authorObj, currentPubs) {
    $("addEntityModalTitle").innerHTML = `<i class="ri-links-line"></i> ربط / فك دور نشر للمؤلف «${escapeHtml(authorObj.name)}»`;
    const extraList = authorObj.extraPublishers || [];

    $("addEntityModalBody").innerHTML = `
        <p class="muted-hint" style="margin-bottom:10px;">تظهر دور النشر تلقائياً من كتب المؤلف، ويمكنك هنا ربط دور نشر إضافية بصفحته أو فكها:</p>
        <div class="input-group">
            <label>إضافة دار نشر مرتبطة بالمؤلف</label>
            <div style="display:flex; gap:8px;">
                <input type="text" id="newExtraPubForAuthorInput" list="existingPublishersDatalist" placeholder="اختر أو اكتب اسم دار النشر...">
                <button type="button" id="addExtraPubToAuthorBtn" class="btn-accent-sm">إضافة</button>
            </div>
        </div>
        <div id="authorExtraPubsManageList" class="stack-list" style="margin-top:12px;">
            ${currentPubs.map(p => `
                <div class="stack-card" style="padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
                    <strong>${escapeHtml(p)}</strong>
                    ${extraList.includes(p)
                        ? `<button type="button" class="btn-ghost-main remove-extra-pub-btn" data-p="${escapeHtml(p)}" style="color:var(--danger); padding:4px 10px; font-size:0.75rem;">فك الارتباط</button>`
                        : `<span class="soft-tag">مرتبطة عبر كتاب</span>`}
                </div>
            `).join("")}
        </div>
    `;

    const saveExtraList = async (updatedExtra) => {
        if (authorObj.isImplicit) {
            await addDoc(collection(db, "reviews"), {
                recordType: "author",
                name: authorObj.name,
                authorType: authorObj.authorType || "public_figure",
                country: authorObj.country || "اليمن",
                bio: authorObj.bio,
                photoUrl: authorObj.photoUrl || "",
                extraPublishers: updatedExtra,
                userId: currentUser.uid,
                userName: currentUser.displayName,
                createdAt: Date.now()
            });
        } else {
            await updateDoc(doc(db, "reviews", authorObj.id), { extraPublishers: updatedExtra });
        }
        await fetchAllEncyclopediaData();
        $("addEntityModal").style.display = "none";
        openAuthorPage(authorObj.name);
    };

    $("addExtraPubToAuthorBtn").onclick = () => {
        const val = $("newExtraPubForAuthorInput").value.trim();
        if (!val) return;
        const next = Array.from(new Set([...extraList, val]));
        saveExtraList(next);
    };

    document.querySelectorAll(".remove-extra-pub-btn").forEach(btn => {
        btn.onclick = () => {
            const pToRemove = btn.getAttribute("data-p");
            const next = extraList.filter(item => item !== pToRemove);
            saveExtraList(next);
        };
    });

    $("addEntityModal").style.display = "flex";
}

// الصفحة المستقلة لدار النشر (تعرض التوثيق، أبرز مؤلفي الدار، وجميع إصداراتها)
function openPublisherPage(publisherName) {
    const normTarget = normalizeArabicIdentity(publisherName);
    let pubObj = allPublishers.find(p => normalizeArabicIdentity(p.name) === normTarget);
    if (!pubObj) {
        pubObj = {
            id: "implicit_pub_" + normTarget,
            isImplicit: true,
            name: publisherName,
            country: "اليمن",
            scope: "يمنية",
            city: "اليمن",
            bio: "دار نشر ومؤسسة ثقافية مدرجة في أرشيف مكتبة وموسوعة الحجرية.",
            verified: false,
            status: "approved",
            userId: ""
        };
    }

    updateSeoAndUrl({ publisher: pubObj, pushUrl: true });
    navigateToPage("publisherDetailPageView", true);

    const publisherBooks = allBooks.filter(b =>
        normalizeArabicIdentity(b.publisher) === normTarget &&
        (b.status === "published_full" || b.status === "published_no_download")
    );

    // استنتاج المؤلفين المرتبطين بهذه الدار
    const pubAuthorsMap = new Map();
    publisherBooks.forEach(b => {
        if (b.author) pubAuthorsMap.set(normalizeArabicIdentity(b.author), b.author);
    });
    allAuthors.forEach(a => {
        if ((a.extraPublishers || []).some(p => normalizeArabicIdentity(p) === normTarget)) {
            pubAuthorsMap.set(normalizeArabicIdentity(a.name), a.name);
        }
    });
    const pubAuthorsList = Array.from(pubAuthorsMap.values());

    // إضافة إصدار من صفحة الدار متاح فقط للإدارة أو لمالك الدار الموثق (منعاً للفوضى كما اتفقنا)
    const isVerifiedOwner = Boolean(currentUser && pubObj.verified && pubObj.userId === currentUser.uid);
    const canManagePub = isAdmin || isVerifiedOwner || (currentUser && pubObj.userId === currentUser.uid);
    const logo = pubObj.logoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(pubObj.name)}&background=c5934c&color=fff&size=200`;

    const container = $("publisherPageContentContainer");
    container.innerHTML = `
        <div class="book-hero-card">
            <div style="display:flex; gap:18px; align-items:center; flex-wrap:wrap;">
                <img src="${escapeHtml(logo)}" style="width:94px; height:94px; border-radius:50%; object-fit:cover; border:2.5px solid var(--accent); background:var(--bg-elevated);">
                <div style="flex:1; min-width:210px;">
                    <div class="book-tags-row">
                        <span class="soft-tag"><i class="ri-building-2-line"></i> ${escapeHtml(pubObj.scope || "دار نشر يمنية")}</span>
                        <span class="soft-tag"><i class="ri-map-pin-line"></i> ${escapeHtml(pubObj.city || pubObj.country || "اليمن")}</span>
                        ${pubObj.verified ? `
                            <span class="soft-tag" style="background:rgba(27,138,82,0.14); color:var(--success);">
                                <i class="ri-verified-badge-fill"></i> دار نشر موثقة رسمياً
                            </span>
                        ` : `
                            <span class="soft-tag">مدرجة في الفهرس العام</span>
                        `}
                    </div>

                    <h2 style="font-family:'Amiri',serif; font-size:1.68rem; margin:6px 0; display:flex; align-items:center; gap:7px;">
                        <span>${escapeHtml(pubObj.name)}</span>
                        ${pubObj.verified ? `<i class="ri-verified-badge-fill" style="color:var(--accent); font-size:1.35rem;" title="دار نشر موثقة بالشارة الذهبية"></i>` : ""}
                    </h2>

                    <p class="muted-hint" style="color:var(--text-main); line-height:1.75;">${escapeHtml(pubObj.bio || "دار نشر ومؤسسة ثقافية.")}</p>

                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
                        ${(isAdmin || isVerifiedOwner) ? `
                            <button type="button" id="addBookForThisPublisherBtn" class="btn-primary-main" style="padding:7px 14px; font-size:0.8rem;">
                                <i class="ri-add-circle-line"></i> إضافة إصدار للدار
                            </button>
                        ` : ""}
                        ${canManagePub ? `
                            <button type="button" id="editPublisherPageBtn" class="btn-ghost-main" style="padding:7px 13px; font-size:0.78rem;">
                                <i class="ri-edit-line"></i> تحديث بيانات الدار
                            </button>
                        ` : ""}
                        ${!pubObj.verified && currentUser ? `
                            <button type="button" id="claimPublisherVerifyBtn" class="btn-accent-sm" style="padding:7px 13px; font-size:0.78rem;">
                                <i class="ri-verified-badge-line"></i> طلب توثيق الدار
                            </button>
                        ` : ""}
                    </div>
                </div>
            </div>

            ${pubAuthorsList.length > 0 ? `
                <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border-color);">
                    <small class="muted-hint" style="display:block; margin-bottom:6px;"><i class="ri-quill-pen-line"></i> أبرز المؤلفين والكتّاب المرتبطين بالدار:</small>
                    <div class="entity-chips-row" id="publisherAssociatedAuthorsRow" style="margin-bottom:0;"></div>
                </div>
            ` : ""}
        </div>

        <h3 style="font-size:1.05rem; margin-bottom:14px; display:flex; align-items:center; gap:6px;">
            <i class="ri-book-shelf-line" style="color:var(--accent);"></i>
            <span>الإصدارات والكتب المنسوبة لـ «${escapeHtml(pubObj.name)}» (${publisherBooks.length})</span>
        </h3>
        <div id="publisherPageBooksGrid" class="clean-books-grid"></div>
    `;

    const authRow = $("publisherAssociatedAuthorsRow");
    if (authRow) {
        pubAuthorsList.forEach(aName => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "author-link-chip";
            btn.innerHTML = `<i class="ri-quill-pen-fill" style="color:var(--accent);"></i><span>${escapeHtml(aName)}</span>`;
            btn.onclick = () => openAuthorPage(aName);
            authRow.appendChild(btn);
        });
    }

    const grid = $("publisherPageBooksGrid");
    if (publisherBooks.length === 0) {
        grid.innerHTML = `<p class="muted-hint">لا توجد كتب منشورة منسوبة لهذه الدار حالياً.</p>`;
    } else {
        publisherBooks.forEach(b => grid.appendChild(createCleanBookCard(b)));
    }

    if ($("addBookForThisPublisherBtn")) {
        $("addBookForThisPublisherBtn").onclick = () => openBookFormModal(null, { presetPublisher: pubObj.name });
    }
    if ($("editPublisherPageBtn")) $("editPublisherPageBtn").onclick = () => openAddOrEditPublisherModal(pubObj);
    if ($("claimPublisherVerifyBtn")) $("claimPublisherVerifyBtn").onclick = () => openAddOrEditPublisherModal(pubObj);

    if ($("sharePublisherDirectLinkBtn")) {
        $("sharePublisherDirectLinkBtn").onclick = async () => {
            const url = getPublisherDirectUrl(pubObj.name);
            if (navigator.share) {
                try { await navigator.share({ title: pubObj.name, url }); return; } catch (e) {}
            }
            navigator.clipboard.writeText(url);
            alert("تم نسخ الرابط المباشر لصفحة دار النشر!");
        };
    }
}

document.querySelectorAll("#authorTypeFilterBar .mini-pill").forEach(pill => {
    pill.addEventListener("click", () => {
        document.querySelectorAll("#authorTypeFilterBar .mini-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        activeAuthorType = pill.getAttribute("data-authtype");
        renderAuthorsAndPublishersDirectory();
    });
});

document.querySelectorAll("#publisherScopeFilter .mini-pill").forEach(pill => {
    pill.addEventListener("click", () => {
        document.querySelectorAll("#publisherScopeFilter .mini-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        activePubScope = pill.getAttribute("data-pubscope");
        renderAuthorsAndPublishersDirectory();
    });
});

function renderAuthorsAndPublishersDirectory() {
    const authorsGrid = $("authorsGridList");
    const pubsGrid = $("publishersGridList");
    if (!authorsGrid || !pubsGrid) return;

    const rawQ = normalizeArabicText($("searchInput")?.value || "");

    authorsGrid.innerHTML = "";
    pubsGrid.innerHTML = "";

    const publishedBooks = allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download");

    const filteredAuthors = allAuthors.filter(a => {
        const aType = a.authorType || "public_figure";
        if (activeAuthorType !== "all" && aType !== activeAuthorType) return false;
        if (!rawQ) return true;
        const text = normalizeArabicText(`${a.name} ${a.country || ""} ${a.bio || ""}`);
        return rawQ.split(" ").every(tok => text.includes(tok) || text.includes(stripArabicPrefixes(tok)));
    });

    if (filteredAuthors.length === 0) {
        authorsGrid.innerHTML = `<p class="muted-hint">لا يوجد مؤلفون مطابقون في هذا التصنيف.</p>`;
    } else {
        filteredAuthors.forEach(author => {
            const normName = normalizeArabicIdentity(author.name);
            const count = publishedBooks.filter(b => normalizeArabicIdentity(b.author) === normName).length;
            const photo = author.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(author.name)}&background=12221e&color=c5934c`;
            const isPubFig = (author.authorType || "public_figure") === "public_figure";

            const card = document.createElement("div");
            card.className = "dir-entity-card";
            card.innerHTML = `
                <img src="${escapeHtml(photo)}" class="dir-entity-avatar" alt="${escapeHtml(author.name)}">
                <div class="dir-entity-info">
                    <h4>${escapeHtml(author.name)}</h4>
                    <p>${escapeHtml(author.bio || "مؤلف وعَلَم")}</p>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <span class="soft-tag">${isPubFig ? "🏛️ شخصية عامة" : "✒️ معاصر"}</span>
                        <span class="soft-tag">${escapeHtml(author.country || "اليمن")}</span>
                        <span class="soft-tag">${count} كتاب</span>
                    </div>
                </div>
            `;
            card.onclick = () => openAuthorPage(author.name);
            authorsGrid.appendChild(card);
        });
    }

    const visiblePubs = allPublishers.filter(p => {
        if (p.status === "rejected") return false;
        const scope = p.scope || "يمنية";
        if (activePubScope !== "all" && scope !== activePubScope) return false;
        if (!rawQ) return true;
        const text = normalizeArabicText(`${p.name} ${p.city || ""} ${p.bio || ""}`);
        return rawQ.split(" ").every(tok => text.includes(tok) || text.includes(stripArabicPrefixes(tok)));
    });

    if (visiblePubs.length === 0) {
        pubsGrid.innerHTML = `<p class="muted-hint">لا توجد دور نشر مطابقة في هذا القسم حالياً.</p>`;
    } else {
        visiblePubs.forEach(pub => {
            const normP = normalizeArabicIdentity(pub.name);
            const count = publishedBooks.filter(b => normalizeArabicIdentity(b.publisher) === normP).length;
            const logo = pub.logoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(pub.name)}&background=c5934c&color=fff`;

            const card = document.createElement("div");
            card.className = "dir-entity-card";
            card.innerHTML = `
                <img src="${escapeHtml(logo)}" class="dir-entity-avatar" alt="${escapeHtml(pub.name)}">
                <div class="dir-entity-info">
                    <h4>
                        <span>${escapeHtml(pub.name)}</span>
                        ${pub.verified ? `<i class="ri-verified-badge-fill" style="color:var(--accent);" title="دار نشر موثقة"></i>` : ""}
                    </h4>
                    <p>${escapeHtml(pub.bio || pub.city || "")}</p>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <span class="soft-tag">${escapeHtml(pub.scope || "يمنية")}</span>
                        <span class="soft-tag">${count} إصدار</span>
                    </div>
                </div>
            `;
            card.onclick = () => openPublisherPage(pub.name);
            pubsGrid.appendChild(card);
        });
    }
}

function openAddOrEditAuthorModal(existingAuthor = null) {
    if (!currentUser) {
        alert("يرجى تسجيل الدخول أولاً.");
        navigateToPage("profileView");
        return;
    }

    $("addEntityModalTitle").innerHTML = `<i class="ri-quill-pen-line"></i> ${existingAuthor ? "تحديث بطاقة المؤلف" : "إضافة مؤلف أو شخصية عامة"}`;
    $("addEntityModalBody").innerHTML = `
        <div class="input-group">
            <label>اسم المؤلف / العلم *</label>
            <input type="text" id="entityAuthorName" value="${escapeHtml(existingAuthor?.name || "")}" ${existingAuthor && !existingAuthor.isImplicit ? "readonly" : ""}>
        </div>
        <div class="grid-2col">
            <div class="input-group">
                <label>صفة المؤلف *</label>
                <select id="entityAuthorType">
                    <option value="public_figure" ${(existingAuthor?.authorType || "public_figure") === "public_figure" ? "selected" : ""}>🏛️ شخصية عامة / علم راحل</option>
                    <option value="contemporary" ${existingAuthor?.authorType === "contemporary" ? "selected" : ""}>✒️ مؤلف معاصر</option>
                </select>
            </div>
            <div class="input-group">
                <label>الدولة العربية *</label>
                <select id="entityAuthorCountry">
                    ${getCountrySelectOptionsHtml(existingAuthor?.country || "اليمن")}
                </select>
            </div>
        </div>
        <div class="input-group">
            <label>السيرة الذاتية والنبذة التعريفية *</label>
            <textarea id="entityAuthorBio" rows="4" placeholder="اكتب نبذة وافية عن مسيرة المؤلف ومؤلفاته...">${escapeHtml(existingAuthor?.bio || "")}</textarea>
        </div>
        <div class="input-group">
            <label>صورة المؤلف (اختياري)</label>
            <input type="file" id="entityAuthorPhoto" accept="image/*">
        </div>
        <div id="entityStatusMsg" class="status-msg"></div>
        <button type="button" id="saveAuthorEntityBtn" class="btn-primary-main w-100">حفظ بطاقة المؤلف</button>
    `;

    $("saveAuthorEntityBtn").onclick = async () => {
        const name = $("entityAuthorName").value.trim();
        const authorType = $("entityAuthorType").value;
        const country = $("entityAuthorCountry").value;
        const bio = $("entityAuthorBio").value.trim();
        const file = $("entityAuthorPhoto").files[0];
        const msg = $("entityStatusMsg");
        const btn = $("saveAuthorEntityBtn");

        if (!name || !bio) {
            msg.style.color = "var(--danger)";
            msg.textContent = "يرجى إدخال اسم المؤلف والنبذة التعريفية.";
            return;
        }

        btn.disabled = true;
        msg.textContent = "جاري الحفظ في السحابة...";

        try {
            let photoUrl = existingAuthor?.photoUrl || "";
            if (file) photoUrl = await compressAndUploadImage(file, 450, 0.8);

            if (existingAuthor && !existingAuthor.isImplicit) {
                await updateDoc(doc(db, "reviews", existingAuthor.id), { name, authorType, country, bio, photoUrl, updatedAt: Date.now() });
            } else {
                await addDoc(collection(db, "reviews"), {
                    recordType: "author",
                    name, authorType, country, bio, photoUrl,
                    extraPublishers: existingAuthor?.extraPublishers || [],
                    userId: currentUser.uid,
                    userName: currentUser.displayName,
                    createdAt: Date.now()
                });
            }

            await fetchAllEncyclopediaData();
            $("addEntityModal").style.display = "none";
            openAuthorPage(name);
        } catch (e) {
            msg.textContent = "حدث خطأ أثناء الحفظ.";
            btn.disabled = false;
        }
    };

    $("addEntityModal").style.display = "flex";
}

function openAddOrEditPublisherModal(existingPub = null) {
    if (!currentUser) {
        alert("يرجى تسجيل الدخول أولاً.");
        navigateToPage("profileView");
        return;
    }

    $("addEntityModalTitle").innerHTML = `<i class="ri-building-2-line"></i> ${existingPub ? "تحديث / توثيق دار النشر" : "إضافة وتوثيق دار نشر"}`;
    $("addEntityModalBody").innerHTML = `
        <div class="input-group">
            <label>اسم دار النشر *</label>
            <input type="text" id="pubNameInput" value="${escapeHtml(existingPub?.name || "")}" placeholder="مثال: دار صفقات كتابية / دار الآداب">
        </div>
        <div class="grid-2col">
            <div class="input-group">
                <label>تصنيف الدار *</label>
                <select id="pubScopeInput">
                    <option value="يمنية" ${(existingPub?.scope || "يمنية") === "يمنية" ? "selected" : ""}>🇾🇪 دار نشر يمنية</option>
                    <option value="عربية / خارجية" ${existingPub?.scope === "عربية / خارجية" ? "selected" : ""}>🌍 دار نشر عربية / خارجية</option>
                </select>
            </div>
            <div class="input-group">
                <label>الدولة والمقر *</label>
                <input type="text" id="pubCityInput" value="${escapeHtml(existingPub?.city || "")}" placeholder="مثال: تعز / القاهرة / بيروت">
            </div>
        </div>
        <div class="input-group">
            <label>الموقع الرسمي أو المعرف لإثبات التوثيق *</label>
            <input type="text" id="pubProofInput" value="${escapeHtml(existingPub?.proof || "")}" placeholder="رابط الموقع أو الصفحة الرسمية للدار...">
        </div>
        <div class="input-group">
            <label>نبذة تعريفية عن الدار وإصداراتها *</label>
            <textarea id="pubBioInput" rows="3" placeholder="نبذة عن تأسيس الدار ورسالتها الثقافية...">${escapeHtml(existingPub?.bio || "")}</textarea>
        </div>
        <div class="input-group">
            <label>شعار دار النشر (اختياري)</label>
            <input type="file" id="pubLogoInput" accept="image/*">
        </div>
        <div id="pubStatusMsg" class="status-msg"></div>
        <button type="button" id="submitPubVerifyBtn" class="btn-primary-main w-100">حفظ بيانات الدار</button>
    `;

    $("submitPubVerifyBtn").onclick = async () => {
        const name = $("pubNameInput").value.trim();
        const scope = $("pubScopeInput").value;
        const city = $("pubCityInput").value.trim();
        const proof = $("pubProofInput").value.trim();
        const bio = $("pubBioInput").value.trim();
        const file = $("pubLogoInput").files[0];
        const msg = $("pubStatusMsg");
        const btn = $("submitPubVerifyBtn");

        if (!name || !city || !bio) {
            msg.style.color = "var(--danger)";
            msg.textContent = "يرجى إكمال الحقول المطلوبة.";
            return;
        }

        btn.disabled = true;
        msg.textContent = "جاري الحفظ...";

        try {
            let logoUrl = existingPub?.logoUrl || "";
            if (file) logoUrl = await compressAndUploadImage(file, 400, 0.8);

            if (existingPub && !existingPub.isImplicit) {
                await updateDoc(doc(db, "reviews", existingPub.id), {
                    name, scope, city, proof, bio, logoUrl, updatedAt: Date.now()
                });
            } else {
                await addDoc(collection(db, "reviews"), {
                    recordType: "publisher",
                    name, scope, city, proof, bio, logoUrl,
                    verified: isAdmin,
                    status: isAdmin ? "approved" : "pending",
                    userId: currentUser.uid,
                    userEmail: currentUser.email,
                    userName: currentUser.displayName,
                    createdAt: Date.now()
                });
            }

            await fetchAllEncyclopediaData();
            $("addEntityModal").style.display = "none";
            openPublisherPage(name);
        } catch (e) {
            msg.textContent = "حدث خطأ، حاول مجدداً.";
            btn.disabled = false;
        }
    };

    $("addEntityModal").style.display = "flex";
}

if ($("openNewAuthorModalBtn")) $("openNewAuthorModalBtn").onclick = () => openAddOrEditAuthorModal(null);
if ($("openNewPublisherModalBtn")) $("openNewPublisherModalBtn").onclick = () => openAddOrEditPublisherModal(null);
if ($("closeAddEntityModal")) $("closeAddEntityModal").onclick = () => $("addEntityModal").style.display = "none";

// ============================================================================
// 10. نافذة النشر، البحث السحابي الحي عن المؤلفين، ومنع التكرار الصارم
// ============================================================================
const addBookModal = $("addBookModal");

if ($("openAddModalBtn")) $("openAddModalBtn").onclick = () => openBookFormModal(null);
if ($("closeAddModal")) $("closeAddModal").onclick = () => addBookModal.style.display = "none";

// التبديل بين الأرشفة الموسوعية وإصدارات الحجرية الرقمية
document.querySelectorAll('input[name="bookPublishMode"]').forEach(radio => {
    radio.addEventListener("change", () => {
        const val = document.querySelector('input[name="bookPublishMode"]:checked')?.value || "archive";
        $("modeArchiveCard").classList.toggle("active", val === "archive");
        $("modeHujariyaPressCard").classList.toggle("active", val === "hujariya_press");
        $("hujariyaPressInfoBanner").style.display = val === "hujariya_press" ? "block" : "none";
    });
});

// اختيار صفة المؤلف (شخصية عامة / أنا المؤلف / مؤلف معاصر)
document.querySelectorAll("#authorRoleSelector .mini-pill").forEach(pill => {
    pill.addEventListener("click", () => {
        document.querySelectorAll("#authorRoleSelector .mini-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        activeAuthorRoleInModal = pill.getAttribute("data-role");

        const notice = $("publicFigureNoticeDetails");
        if (notice) notice.style.display = activeAuthorRoleInModal === "public_figure" ? "block" : "none";

        if (activeAuthorRoleInModal === "self_author" && currentUser) {
            $("bookAuthorInput").value = currentUser.displayName || "";
            checkDuplicateRealtime();
        }
    });
});

// محرك الاقتراحات السحابية الفورية للمؤلفين أثناء الكتابة
function renderCloudAuthorSuggestions(queryText) {
    const menu = $("cloudAuthorSuggestionsMenu");
    if (!menu) return;
    const cleanQ = normalizeArabicText(queryText);
    if (!cleanQ || $("bookAuthorInput").readOnly) {
        menu.style.display = "none";
        return;
    }

    const matches = allAuthors.filter(a => {
        const normN = normalizeArabicText(a.name);
        return normN.includes(cleanQ) || cleanQ.split(" ").every(t => normN.includes(stripArabicPrefixes(t)));
    }).slice(0, 6);

    menu.style.display = "block";
    menu.innerHTML = `
        ${matches.map(a => `
            <div class="cloud-suggestion-item" data-name="${escapeHtml(a.name)}" data-country="${escapeHtml(a.country || "اليمن")}">
                <div style="display:flex; align-items:center; gap:9px;">
                    <img src="${escapeHtml(a.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=12221e&color=c5934c`)}">
                    <div>
                        <strong style="font-size:0.86rem; display:block;">${escapeHtml(a.name)}</strong>
                        <small class="muted-hint">${(a.authorType || "public_figure") === "public_figure" ? "🏛️ شخصية عامة" : "✒️ معاصر"} • ${escapeHtml(a.country || "اليمن")}</small>
                    </div>
                </div>
                <span class="soft-tag"><i class="ri-links-line"></i> ربط سحابي</span>
            </div>
        `).join("")}
        <div class="cloud-suggestion-item" id="createNewCloudAuthorOpt" style="background:var(--bg-main);">
            <span style="font-size:0.82rem; font-weight:700; color:var(--accent);">
                <i class="ri-user-add-line"></i> مؤلف جديد باسم «${escapeHtml(queryText.trim())}» (إضافة سيرة وصورة)
            </span>
        </div>
    `;

    menu.querySelectorAll(".cloud-suggestion-item[data-name]").forEach(item => {
        item.onclick = () => {
            $("bookAuthorInput").value = item.getAttribute("data-name");
            const c = item.getAttribute("data-country");
            if (c && $("bookCountryInput")) $("bookCountryInput").value = c;
            menu.style.display = "none";
            checkDuplicateRealtime();
        };
    });

    const newOpt = $("createNewCloudAuthorOpt");
    if (newOpt) {
        newOpt.onclick = () => {
            menu.style.display = "none";
            $("inlineNewAuthorFields").style.display = "block";
            $("newAuthorBioInput").focus();
        };
    }
}

if ($("toggleNewAuthorInlineBtn")) {
    $("toggleNewAuthorInlineBtn").onclick = () => {
        const box = $("inlineNewAuthorFields");
        box.style.display = box.style.display === "none" ? "block" : "none";
    };
}

if ($("unlockPresetAuthorBtn")) {
    $("unlockPresetAuthorBtn").onclick = () => {
        $("bookAuthorInput").readOnly = false;
        $("unlockPresetAuthorBtn").style.display = "none";
        $("bookAuthorInput").focus();
    };
}

if ($("bookCoverInput")) {
    $("bookCoverInput").onchange = () => {
        const f = $("bookCoverInput").files[0];
        if (f) $("selectedCoverName").textContent = `تم اختيار: ${f.name}`;
    };
}

function openBookFormModal(bookToEdit = null, presets = {}) {
    if (!currentUser) {
        alert("يرجى تسجيل الدخول بحساب جوجل أولاً.");
        navigateToPage("profileView");
        return;
    }

    $("editingBookId").value = bookToEdit ? bookToEdit.id : "";
    $("bookModalHeaderTitle").innerHTML = bookToEdit
        ? `<i class="ri-edit-box-line"></i> تعديل: ${escapeHtml(bookToEdit.title)}`
        : (presets.presetAuthor ? `<i class="ri-quill-pen-line"></i> إضافة كتاب للمؤلف «${escapeHtml(presets.presetAuthor)}»` : `<i class="ri-book-mark-line"></i> توثيق كتاب / إصدار رقمي`);

    const pubMode = bookToEdit?.publishMode || "archive";
    const modeRadio = document.querySelector(`input[name="bookPublishMode"][value="${pubMode}"]`);
    if (modeRadio) {
        modeRadio.checked = true;
        modeRadio.dispatchEvent(new Event("change"));
    }

    $("bookTitleInput").value = bookToEdit ? bookToEdit.title : "";
    $("bookAuthorInput").value = bookToEdit ? bookToEdit.author : (presets.presetAuthor || "");
    $("bookAuthorInput").readOnly = Boolean(presets.presetAuthor);
    $("unlockPresetAuthorBtn").style.display = presets.presetAuthor ? "flex" : "none";

    $("bookCategoryInput").value = bookToEdit ? normalizeCategory(bookToEdit.category) : "روايات وأدب";
    $("bookCountryInput").value = bookToEdit?.country || presets.presetCountry || "اليمن";
    $("bookEraInput").value = bookToEdit?.era || "الألفية الحديثة";
    $("bookPublisherInput").value = bookToEdit?.publisher || presets.presetPublisher || "";
    $("bookCityYearInput").value = bookToEdit?.cityYear || "";
    $("bookPagesCountInput").value = bookToEdit?.pagesCount || "";
    $("bookIsbnInput").value = bookToEdit?.isbn || "";
    $("bookDescInput").value = bookToEdit ? bookToEdit.description : "";
    $("bookDriveInput").value = bookToEdit?.downloadLink || "";
    $("bookAudioInput").value = bookToEdit?.audioUrl || "";
    $("bookCoverInput").value = "";
    $("selectedCoverName").textContent = bookToEdit
        ? "اتركه فارغاً للاحتفاظ بالغلاف الحالي"
        : "اضغط لاختيار صورة غلاف واضحة";
    $("submitBookBtnText").textContent = bookToEdit
        ? (isAdmin ? "حفظ التعديلات فوراً" : "حفظ وإحالة للمراجعة")
        : "فحص التكرار وإرسال الكتاب";

    $("cloudAuthorSuggestionsMenu").style.display = "none";
    $("inlineNewAuthorFields").style.display = "none";
    $("duplicateWarningBox").style.display = "none";
    $("uploadStatusMsg").textContent = "";
    addBookModal.style.display = "flex";
}

function checkDuplicateRealtime() {
    const editingId = $("editingBookId").value;
    const normT = normalizeArabicIdentity($("bookTitleInput").value);
    const normA = normalizeArabicIdentity($("bookAuthorInput").value);
    const warnBox = $("duplicateWarningBox");

    if (!normT || !normA) {
        warnBox.style.display = "none";
        return null;
    }

    const dup = allBooks.find(b =>
        b.id !== editingId &&
        normalizeArabicIdentity(b.title) === normT &&
        normalizeArabicIdentity(b.author) === normA
    );

    if (dup) {
        warnBox.style.display = "block";
        warnBox.innerHTML = `<i class="ri-error-warning-fill"></i> مرفوض للتكرار: كتاب «${escapeHtml(dup.title)}» للمؤلف «${escapeHtml(dup.author)}» موثق مسبقاً في السحابة برقم (${getBookDepositSerial(dup)})!`;
        return dup;
    }
    warnBox.style.display = "none";
    return null;
}

if ($("bookTitleInput")) $("bookTitleInput").oninput = checkDuplicateRealtime;
if ($("bookAuthorInput")) {
    $("bookAuthorInput").oninput = (e) => {
        checkDuplicateRealtime();
        renderCloudAuthorSuggestions(e.target.value);
    };
    document.addEventListener("click", (e) => {
        if (!e.target.closest("#bookAuthorInput") && !e.target.closest("#cloudAuthorSuggestionsMenu")) {
            if ($("cloudAuthorSuggestionsMenu")) $("cloudAuthorSuggestionsMenu").style.display = "none";
        }
    });
}

if ($("submitBookBtn")) {
    $("submitBookBtn").onclick = async () => {
        const editingId = $("editingBookId").value;
        const existingBook = editingId ? allBooks.find(b => b.id === editingId) : null;

        const publishMode = document.querySelector('input[name="bookPublishMode"]:checked')?.value || "archive";
        const title = $("bookTitleInput").value.trim();
        const author = $("bookAuthorInput").value.trim();
        const category = $("bookCategoryInput").value;
        const country = $("bookCountryInput").value;
        const era = $("bookEraInput").value;
        const publisher = $("bookPublisherInput").value.trim() || (publishMode === "hujariya_press" ? "إصدارات مكتبة الحجرية" : "");
        const cityYear = $("bookCityYearInput").value.trim();
        const pagesCount = $("bookPagesCountInput").value.trim();
        const isbn = $("bookIsbnInput").value.trim();
        const description = $("bookDescInput").value.trim();
        const downloadLink = $("bookDriveInput").value.trim();
        const audioUrl = $("bookAudioInput").value.trim();
        const coverFile = $("bookCoverInput").files[0];

        const newAuthorBio = $("newAuthorBioInput").value.trim();
        const newAuthorPhotoFile = $("newAuthorPhotoInput").files[0];

        const msg = $("uploadStatusMsg");
        const btn = $("submitBookBtn");

        if (!title || !author || !description || (!coverFile && !existingBook)) {
            msg.style.color = "var(--danger)";
            msg.textContent = "يرجى إكمال الحقول الأساسية وصورة الغلاف.";
            return;
        }

        if (checkDuplicateRealtime()) return;

        btn.disabled = true;
        msg.style.color = "var(--accent)";
        msg.textContent = "جاري ضغط الغلاف وتوثيق البيانات في السحابة...";

        try {
            let coverUrl = existingBook ? existingBook.coverUrl : "";
            if (coverFile) coverUrl = await compressAndUploadImage(coverFile, 800, 0.78);

            const normAuth = normalizeArabicIdentity(author);
            const authorExists = allAuthors.some(a => !a.isImplicit && normalizeArabicIdentity(a.name) === normAuth);
            if (!authorExists && (newAuthorBio || newAuthorPhotoFile)) {
                let authorPhotoUrl = "";
                if (newAuthorPhotoFile) authorPhotoUrl = await compressAndUploadImage(newAuthorPhotoFile, 450, 0.8);
                await addDoc(collection(db, "reviews"), {
                    recordType: "author",
                    name: author,
                    authorType: activeAuthorRoleInModal === "public_figure" ? "public_figure" : "contemporary",
                    country,
                    bio: newAuthorBio || `مؤلف كتاب ${title}`,
                    photoUrl: authorPhotoUrl,
                    extraPublishers: publisher ? [publisher] : [],
                    userId: currentUser.uid,
                    userName: currentUser.displayName,
                    createdAt: Date.now()
                });
            }

            const newStatus = isAdmin
                ? (downloadLink ? "published_full" : "published_no_download")
                : "pending";

            const depositSerial = existingBook?.depositSerial || getBookDepositSerial({
                id: editingId || `${title}_${author}_${Date.now()}`,
                title,
                cityYear,
                publishMode,
                createdAt: Date.now()
            });

            const payload = {
                title, author, category, country, era,
                publishMode, depositSerial,
                authorRole: activeAuthorRoleInModal,
                publisher, cityYear, pagesCount, isbn,
                description, downloadLink, audioUrl, coverUrl,
                status: newStatus,
                updatedAt: Date.now()
            };

            if (existingBook) {
                if (isAdmin) {
                    await updateDoc(doc(db, "books", existingBook.id), payload);
                    if (existingBook.overrideDocId) await deleteDoc(doc(db, "reviews", existingBook.overrideDocId));
                } else {
                    await addDoc(collection(db, "reviews"), {
                        recordType: "book_override",
                        bookId: existingBook.id,
                        userId: currentUser.uid,
                        userName: currentUser.displayName,
                        updatedFields: payload,
                        createdAt: Date.now()
                    });
                }
            } else {
                await addDoc(collection(db, "books"), {
                    ...payload,
                    addedByUid: currentUser.uid,
                    addedByName: currentUser.displayName,
                    addedByEmail: currentUser.email,
                    addedByPhoto: currentUser.photoURL || "",
                    ratingSum: 0,
                    ratingCount: 0,
                    createdAt: Date.now()
                });
            }

            msg.style.color = "var(--success)";
            msg.textContent = isAdmin
                ? `تم النشر الفوري برقم توثيق (${depositSerial})!`
                : `تم الإرسال لغرفة المراجعة برقم مبدئي (${depositSerial})!`;

            await fetchAllEncyclopediaData();
            setTimeout(() => {
                addBookModal.style.display = "none";
                btn.disabled = false;
            }, 1200);
        } catch (err) {
            msg.style.color = "var(--danger)";
            msg.textContent = "حدث خطأ أثناء الرفع، حاول مجدداً.";
            btn.disabled = false;
        }
    };
}

// ============================================================================
// 11. نظام البلاغات المصورة والمحادثة المباشرة مع الإدارة
// ============================================================================
function openReportTicketModal(book = null, existingTicket = null) {
    if (!currentUser) {
        alert("يرجى تسجيل الدخول أولاً لفتح بلاغ.");
        navigateToPage("profileView");
        return;
    }

    const body = $("reportModalBody");

    if (existingTicket) {
        const messages = existingTicket.messages || [];
        const relatedBook = allBooks.find(b => b.id === existingTicket.bookId);

        body.innerHTML = `
            <div style="background:var(--bg-main); padding:11px; border-radius:10px; margin-bottom:10px;">
                <strong>بلاغ حول: ${escapeHtml(existingTicket.bookTitle)}</strong>
                <p class="muted-hint">${escapeHtml(existingTicket.reason)}</p>
            </div>

            ${isAdmin && relatedBook ? `
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
                    <button type="button" id="repSuspendBtn" class="btn-accent-sm" style="background:var(--warning);">تعليق الكتاب</button>
                    <button type="button" id="repNoDlBtn" class="btn-ghost-main" style="padding:6px 10px; font-size:0.76rem;">إلغاء التحميل</button>
                    <button type="button" id="repCloseTicketBtn" class="btn-primary-main" style="background:var(--success); padding:6px 10px; font-size:0.76rem;">إغلاق البلاغ</button>
                </div>
            ` : ""}

            <div class="chat-messages-box" id="reportChatBox">
                ${messages.map(m => `
                    <div class="chat-bubble ${m.isAdminReply ? 'admin' : 'user'}">
                        <strong style="display:block; font-size:0.74rem; margin-bottom:2px;">
                            ${m.isAdminReply ? '🛡️ إدارة مكتبة الحجرية' : escapeHtml(m.senderName)}
                        </strong>
                        <p>${escapeHtml(m.text)}</p>${m.images?.length ? `
                            <div class="chat-images-grid">
                                ${m.images.map(u => `<a href="${escapeHtml(u)}" target="_blank"><img src="${escapeHtml(u)}"></a>`).join("")}
                            </div>
                        ` : ""}
                    </div>
                `).join("")}
            </div>

            <div class="input-group">
                <textarea id="chatReplyInput" rows="2" placeholder="اكتب ردك..."></textarea>
            </div>
            <div class="input-group">
                <label>إرفاق صور (حتى 3 صور - اختياري)</label>
                <input type="file" id="chatReplyImages" accept="image/*" multiple>
            </div>
            <button type="button" id="sendChatReplyBtn" class="btn-primary-main w-100">إرسال الرد</button>
        `;

        $("sendChatReplyBtn").onclick = async () => {
            const text = $("chatReplyInput").value.trim();
            const files = Array.from($("chatReplyImages").files).slice(0, 3);
            if (!text && files.length === 0) return;
            $("sendChatReplyBtn").disabled = true;

            const urls = [];
            for (const f of files) urls.push(await compressAndUploadImage(f, 750, 0.75));

            const updated = [
                ...messages,
                {
                    senderUid: currentUser.uid,
                    senderName: currentUser.displayName,
                    isAdminReply: isAdmin,
                    text: text || "مرفق صور",
                    images: urls,
                    time: Date.now()
                }
            ];

            await updateDoc(doc(db, "reviews", existingTicket.id), { messages: updated, updatedAt: Date.now() });
            await fetchAllEncyclopediaData();
            const refreshed = allReports.find(r => r.id === existingTicket.id);
            if (refreshed) openReportTicketModal(null, refreshed);
        };

        if (isAdmin && relatedBook) {
            $("repSuspendBtn").onclick = async () => {
                await updateDoc(doc(db, "books", relatedBook.id), { status: "suspended" });
                alert("تم تعليق الكتاب.");
                fetchAllEncyclopediaData();
            };
            $("repNoDlBtn").onclick = async () => {
                await updateDoc(doc(db, "books", relatedBook.id), { status: "published_no_download", downloadLink: "" });
                alert("تم تحويل الكتاب لنسخة موسوعية فقط.");
                fetchAllEncyclopediaData();
            };
            $("repCloseTicketBtn").onclick = async () => {
                await updateDoc(doc(db, "reviews", existingTicket.id), { status: "resolved" });
                $("reportModal").style.display = "none";
                fetchAllEncyclopediaData();
            };
        }

        $("reportModal").style.display = "flex";
        return;
    }

    body.innerHTML = `
        <div class="input-group">
            <label>الكتاب</label>
            <input type="text" value="${escapeHtml(book?.title || "")}" readonly>
        </div>
        <div class="input-group">
            <label>سبب البلاغ *</label>
            <select id="reportReasonSelect">
                <option value="حقوق ملكية فكرية / طلب إيقاف التحميل">حقوق ملكية فكرية / طلب إيقاف التحميل</option>
                <option value="خطأ في ربط المؤلف أو دار النشر">خطأ في ربط المؤلف أو دار النشر</option>
                <option value="رابط جوجل درايف لا يعمل">رابط جوجل درايف لا يعمل</option>
                <option value="محتوى مخالف">محتوى مخالف</option>
            </select>
        </div>
        <div class="input-group">
            <label>التفاصيل *</label>
            <textarea id="reportDetailsInput" rows="3" placeholder="اشرح المشكلة ليتم معالجتها..."></textarea>
        </div>
        <div class="input-group">
            <label>إرفاق صور إثباتية (حتى 3 صور - اختياري)</label>
            <input type="file" id="reportImagesInput" accept="image/*" multiple>
        </div>
        <button type="button" id="createReportTicketBtn" class="btn-primary-main w-100" style="background:var(--danger);">إرسال البلاغ وفتح محادثة</button>
    `;

    $("createReportTicketBtn").onclick = async () => {
        const reason = $("reportReasonSelect").value;
        const details = $("reportDetailsInput").value.trim();
        const files = Array.from($("reportImagesInput").files).slice(0, 3);
        if (!details) return;
        $("createReportTicketBtn").disabled = true;

        const urls = [];
        for (const f of files) urls.push(await compressAndUploadImage(f, 750, 0.75));

        const docRef = await addDoc(collection(db, "reviews"), {
            recordType: "report",
            bookId: book.id,
            bookTitle: book.title,
            userId: currentUser.uid,
            userName: currentUser.displayName,
            reason,
            status: "open",
            messages: [{
                senderUid: currentUser.uid,
                senderName: currentUser.displayName,
                isAdminReply: false,
                text: details,
                images: urls,
                time: Date.now()
            }],
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        await fetchAllEncyclopediaData();
        const ticket = allReports.find(r => r.id === docRef.id);
        if (ticket) openReportTicketModal(null, ticket);
    };

    $("reportModal").style.display = "flex";
}

if ($("closeReportModal")) $("closeReportModal").onclick = () => $("reportModal").style.display = "none";

// ============================================================================
// 12. مكتبتي السحابية، غرفة الإدارة (المراجعة + مقترحات التعديل)، وتثبيت التطبيق
// ============================================================================
document.querySelectorAll("#myUploadsStatusFilter .mini-pill").forEach(pill => {
    pill.addEventListener("click", () => {
        document.querySelectorAll("#myUploadsStatusFilter .mini-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        activeMyUploadsFilter = pill.getAttribute("data-st");
        renderMyLibraryView();
    });
});

function renderMyLibraryView() {
    const cloudList = $("cloudReadingList");
    const savedShelf = $("savedBooksShelf");
    const uploadsShelf = $("myUploadedBooksShelf");
    const reportsList = $("myReportsTicketsList");
    if (!cloudList || !savedShelf || !uploadsShelf || !reportsList) return;

    cloudList.innerHTML = "";
    savedShelf.innerHTML = "";
    uploadsShelf.innerHTML = "";
    reportsList.innerHTML = "";

    // 1. قائمة قراءاتي السحابية المتزامنة عبر الأجهزة
    const readingItems = Object.values(userReadingProgress).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (readingItems.length === 0) {
        cloudList.innerHTML = `<p class="muted-hint">لا توجد كتب قيد القراءة حالياً. عند قراءة أي كتاب، سيحفظ النظام رقم صفحتك وملاحظاتك هنا سحابياً لتكمل القراءة من أي جهاز.</p>`;
    } else {
        readingItems.forEach(item => {
            const book = allBooks.find(b => b.id === item.bookId);
            const card = document.createElement("div");
            card.className = "stack-card";
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <img src="${escapeHtml(book?.coverUrl || item.coverUrl || "")}" style="width:48px; height:68px; object-fit:cover; border-radius:8px; border:1px solid var(--accent);">
                        <div>
                            <span class="soft-tag"><i class="ri-bookmark-3-line"></i> توقفت عند صفحة (${item.page || 1})</span>
                            <h4 style="margin-top:4px;">${escapeHtml(book?.title || item.bookTitle || "")}</h4>
                            <small class="muted-hint">${escapeHtml(book?.author || item.author || "")}</small>
                            ${item.note ? `<p style="font-size:0.8rem; color:var(--accent); margin-top:4px;"><i class="ri-sticky-note-line"></i> ملاحظتك: ${escapeHtml(item.note)}</p>` : ""}
                        </div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        ${book && book.downloadLink ? `
                            <button type="button" class="btn-primary-main resume-cloud-btn" style="padding:8px 14px; font-size:0.8rem;">
                                <i class="ri-book-read-fill"></i> متابعة القراءة
                            </button>
                        ` : ""}
                        ${book ? `
                            <button type="button" class="btn-ghost-main open-book-cloud-btn" style="padding:8px 12px; font-size:0.8rem;">بطاقة الكتاب</button>
                        ` : ""}
                    </div>
                </div>
            `;
            if (card.querySelector(".resume-cloud-btn")) {
                card.querySelector(".resume-cloud-btn").onclick = () => openCloudPdfReader(book);
            }
            if (card.querySelector(".open-book-cloud-btn")) {
                card.querySelector(".open-book-cloud-btn").onclick = () => openBookPage(book);
            }
            cloudList.appendChild(card);
        });
    }

    // 2. الكتب المحفوظة
    const favs = allBooks.filter(b => userFavorites.includes(b.id));
    if (favs.length === 0) savedShelf.innerHTML = `<p class="muted-hint">لا توجد كتب محفوظة بعد.</p>`;
    else favs.forEach(b => savedShelf.appendChild(createCleanBookCard(b)));

    // 3. مساهماتي
    const myBooks = allBooks.filter(b => currentUser && b.addedByUid === currentUser.uid);
    const filteredUploads = myBooks.filter(b => {
        if (activeMyUploadsFilter === "all") return true;
        if (activeMyUploadsFilter === "published") return b.status === "published_full" || b.status === "published_no_download";
        return b.status === activeMyUploadsFilter;
    });

    if (filteredUploads.length === 0) uploadsShelf.innerHTML = `<p class="muted-hint">لا توجد مساهمات في هذا القسم.</p>`;
    else filteredUploads.forEach(b => uploadsShelf.appendChild(createCleanBookCard(b, true)));

    // 4. بلاغاتي
    const myReports = allReports.filter(r => currentUser && r.userId === currentUser.uid);
    if (myReports.length === 0) reportsList.innerHTML = `<p class="muted-hint">لا توجد بلاغات مفتوحة.</p>`;
    else {
        myReports.forEach(t => {
            const d = document.createElement("div");
            d.className = "stack-card";
            d.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h4>${escapeHtml(t.bookTitle)}</h4>
                        <small class="muted-hint">${escapeHtml(t.reason)}</small>
                    </div>
                    <button type="button" class="btn-accent-sm">المحادثة (${(t.messages || []).length})</button>
                </div>
            `;
            d.querySelector("button").onclick = () => openReportTicketModal(null, t);
            reportsList.appendChild(d);
        });
    }
}

function renderAdminDashboard() {
    const pendingBooks = allBooks.filter(b => b.status === "pending" || b.status === "suspended");
    const pendingEdits = allEditSuggestions.filter(e => e.status === "pending");
    const openReports = allReports.filter(r => r.status !== "resolved");
    const pendingPubs = allPublishers.filter(p => !p.isImplicit && p.status === "pending");

    if ($("pendingBadge")) $("pendingBadge").textContent = pendingBooks.length + pendingEdits.length + openReports.length + pendingPubs.length;
    if ($("adminPendingCount")) $("adminPendingCount").textContent = pendingBooks.length;
    if ($("adminEditsCount")) $("adminEditsCount").textContent = pendingEdits.length;
    if ($("adminReportsCount")) $("adminReportsCount").textContent = openReports.length;
    if ($("adminPubsCount")) $("adminPubsCount").textContent = pendingPubs.length;

    // 1. مراجعة الكتب وإصدارات الحجرية
    const pendingContainer = $("pendingBooksList");
    if (pendingContainer) {
        pendingContainer.innerHTML = pendingBooks.length === 0 ? `<p class="muted-hint">لا توجد كتب معلقة حالياً.</p>` : "";
        pendingBooks.forEach(book => {
            const isPress = book.publishMode === "hujariya_press";
            const serial = getBookDepositSerial(book);
            const card = document.createElement("div");
            card.className = "stack-card";
            card.innerHTML = `
                <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:center;">
                    <img src="${escapeHtml(book.coverUrl)}" style="width:68px; height:100px; object-fit:cover; border-radius:8px;">
                    <div style="flex:1; min-width:200px;">
                        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:4px;">
                            <span class="soft-tag">${book.status === "suspended" ? "⚠️ معلق" : "⏳ قيد المراجعة"}</span>
                            ${isPress ? `<span class="press-exclusive-badge"><i class="ri-vip-diamond-fill"></i> طلب نشر في إصدارات الحجرية (${serial})</span>` : `<span class="soft-tag">#${serial}</span>`}
                        </div>
                        <h4 style="margin:4px 0; cursor:pointer;" class="adm-open-b">${escapeHtml(book.title)} — ${escapeHtml(book.author)}</h4>
                        <p class="muted-hint">${escapeHtml(book.description)}</p>
                        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
                            <button type="button" class="btn-primary-main adm-full" style="background:var(--success); padding:6px 11px; font-size:0.76rem;">اعتماد مع التحميل</button>
                            <button type="button" class="btn-accent-sm adm-nodl">اعتماد موسوعي فقط</button>
                            <button type="button" class="btn-ghost-main adm-relink" style="padding:6px 11px; font-size:0.76rem;"><i class="ri-links-line"></i> تعديل الربط</button>
                            <button type="button" class="btn-primary-main adm-rej" style="background:var(--danger); padding:6px 11px; font-size:0.76rem;">رفض</button>
                        </div>
                    </div>
                </div>
            `;
            const setSt = async (st, clearDl = false) => {
                const up = { status: st, depositSerial: serial };
                if (clearDl) up.downloadLink = "";
                if (book.overrideDocId) {
                    Object.assign(up, bookOverrides[book.id].updatedFields, { status: st });
                    await deleteDoc(doc(db, "reviews", book.overrideDocId));
                }
                await updateDoc(doc(db, "books", book.id), up);
                await recordAuditLog("مراجعة كتاب", `${book.title} -> ${st}`);
                fetchAllEncyclopediaData();
            };
            card.querySelector(".adm-open-b").onclick = () => openBookPage(book);
            card.querySelector(".adm-full").onclick = () => setSt("published_full");
            card.querySelector(".adm-nodl").onclick = () => setSt("published_no_download", true);
            card.querySelector(".adm-relink").onclick = () => openAdminBookRelinkModal(book);
            card.querySelector(".adm-rej").onclick = () => setSt("rejected");
            pendingContainer.appendChild(card);
        });
    }

    // 2. مقترحات الإثراء والتعديل الجماعي من القراء (موافقة بضغطة زر واحدة)
    const editsContainer = $("adminEditSuggestionsList");
    if (editsContainer) {
        editsContainer.innerHTML = pendingEdits.length === 0 ? `<p class="muted-hint">لا توجد مقترحات تعديل معلقة.</p>` : "";
        pendingEdits.forEach(ed => {
            const p = ed.proposedFields || {};
            const card = document.createElement("div");
            card.className = "stack-card";
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
                    <div>
                        <span class="soft-tag">مقترح من: ${escapeHtml(ed.userName)}</span>
                        <h4 style="margin:4px 0;">تعديل كتاب: ${escapeHtml(ed.bookTitle)}</h4>
                        <p class="muted-hint" style="font-size:0.8rem;">
                            <strong>المؤلف:</strong> ${escapeHtml(p.author)} | <strong>الدار:</strong> ${escapeHtml(p.publisher || "—")} | <strong>الصفحات:</strong> ${escapeHtml(p.pagesCount || "—")} | <strong>ISBN:</strong> ${escapeHtml(p.isbn || "—")}
                        </p>
                        <p style="font-size:0.82rem; margin-top:4px;">${escapeHtml(p.description || "")}</p>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button type="button" class="btn-primary-main approve-edit-btn" style="background:var(--success); padding:6px 12px; font-size:0.78rem;">اعتماد ودمج فوراً</button>
                        <button type="button" class="btn-ghost-main reject-edit-btn" style="color:var(--danger); padding:6px 12px; font-size:0.78rem;">تجاهل</button>
                    </div>
                </div>
            `;
            card.querySelector(".approve-edit-btn").onclick = async () => {
                await updateDoc(doc(db, "books", ed.bookId), { ...p, updatedAt: Date.now() });
                await deleteDoc(doc(db, "reviews", ed.id));
                await recordAuditLog("اعتماد مقترح إثراء كتاب", ed.bookTitle);
                fetchAllEncyclopediaData();
            };
            card.querySelector(".reject-edit-btn").onclick = async () => {
                await deleteDoc(doc(db, "reviews", ed.id));
                fetchAllEncyclopediaData();
            };
            editsContainer.appendChild(card);
        });
    }

    // 3. البلاغات
    const repContainer = $("adminReportsList");
    if (repContainer) {
        repContainer.innerHTML = allReports.length === 0 ? `<p class="muted-hint">لا توجد بلاغات.</p>` : "";
        allReports.forEach(r => {
            const d = document.createElement("div");
            d.className = "stack-card";
            d.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <span class="soft-tag">${r.status === "resolved" ? "محلول" : "نشط"}</span>
                        <h4>${escapeHtml(r.bookTitle)}</h4>
                        <small class="muted-hint">${escapeHtml(r.userName)} • ${escapeHtml(r.reason)}</small>
                    </div>
                    <button type="button" class="btn-primary-main" style="padding:7px 13px; font-size:0.78rem;">فتح المحادثة</button>
                </div>
            `;
            d.querySelector("button").onclick = () => openReportTicketModal(null, r);
            repContainer.appendChild(d);
        });
    }

    // 4. توثيق دور النشر
    const pubsContainer = $("adminPublishersList");
    if (pubsContainer) {
        const realPubs = allPublishers.filter(p => !p.isImplicit);
        pubsContainer.innerHTML = realPubs.length === 0 ? `<p class="muted-hint">لا توجد طلبات دور نشر.</p>` : "";
        realPubs.forEach(p => {
            const d = document.createElement("div");
            d.className = "stack-card";
            d.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div>
                        <span class="soft-tag">${escapeHtml(p.scope || "يمنية")}</span>
                        <h4 style="cursor:pointer;" class="adm-pub-title">${escapeHtml(p.name)} (${escapeHtml(p.city)})</h4>
                        <small class="muted-hint">${escapeHtml(p.proof)}</small>
                    </div>
                    <button type="button" class="btn-accent-sm adm-pub-btn">${p.verified ? "إلغاء التوثيق" : "توثيق الدار"}</button>
                </div>
            `;
            d.querySelector(".adm-pub-title").onclick = () => openPublisherPage(p.name);
            d.querySelector(".adm-pub-btn").onclick = async () => {
                await updateDoc(doc(db, "reviews", p.id), { verified: !p.verified, status: !p.verified ? "approved" : "pending" });
                fetchAllEncyclopediaData();
            };
            pubsContainer.appendChild(d);
        });
    }

    // 5. السجل الرقابي
    const auditContainer = $("adminAuditLogsList");
    if (auditContainer) {
        auditContainer.innerHTML = allAuditLogs.slice(0, 25).map(l => `
            <div class="stack-card" style="padding:10px 14px;">
                <strong>${escapeHtml(l.actionTitle)}</strong> — <span class="muted-hint">${escapeHtml(l.detailsText)} (${escapeHtml(l.userName)})</span>
            </div>
        `).join("");
    }
}

// لوحة الشرف ودليل المنصة
if ($("openHonorBoardBtn")) {
    $("openHonorBoardBtn").onclick = () => {
        const counts = {};
        allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download").forEach(b => {
            const k = b.addedByUid || b.addedByName || "anon";
            if (!counts[k]) {
                counts[k] = {
                    name: b.addedByName || "باحث",
                    photo: b.addedByPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.addedByName || "م")}&background=12221e&color=c5934c`,
                    count: 0
                };
            }
            counts[k].count++;
        });
        const top = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 15);

        $("infoModalTitle").innerHTML = `<i class="ri-medal-fill"></i> لوحة الشرف للمساهمين`;
        $("infoModalBody").innerHTML = top.map((u, i) => `
            <div class="stack-card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <strong style="color:var(--accent);">#${i + 1}</strong>
                    <img src="${escapeHtml(u.photo)}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
                    <div>
                        <h4>${escapeHtml(u.name)}</h4>
                        <small class="muted-hint">${getContributorRank(u.count).title}</small>
                    </div>
                </div>
                <span class="soft-tag">${u.count} كتاب</span>
            </div>
        `).join("") || `<p class="muted-hint">لا توجد مساهمات بعد.</p>`;
        $("infoModal").style.display = "flex";
    };
}

if ($("openFaqModalBtn")) {
    $("openFaqModalBtn").onclick = () => {
        $("infoModalTitle").innerHTML = `<i class="ri-question-line"></i> دليل مكتبة وموسوعة الحجرية (الإصدار 1.5)`;
        $("infoModalBody").innerHTML = `
            <div class="accordion-group">
                <details class="clean-accordion" open>
                    <summary><span>ما هو نظام «إصدارات الحجرية» للنشر الرقمي؟</span><i class="ri-arrow-down-s-line acc-arrow"></i></summary>
                    <div class="accordion-body">تتبنى مكتبة وموسوعة الحجرية نشر الأعمال الرقمية للمؤلفين والباحثين، وتمنح كل عمل مقبول رقم إيداع مرجعي فريد (<code>HJ-PUB-YYYY-XXXX</code>) وشهادة توثيق رقمية تحفظ أسبقية النشر وتدعم الاستشهاد الأكاديمي.</div>
                </details>
                <details class="clean-accordion">
                    <summary><span>كيف تعمل المزامنة السحابية للقراءة؟</span><i class="ri-arrow-down-s-line acc-arrow"></i></summary>
                    <div class="accordion-body">أثناء قراءة أي كتاب، يمكنك حفظ رقم الصفحة وملاحظاتك الشخصية في السحابة، وعند فتح حسابك من أي هاتف أو كمبيوتر آخر ستجد الكتاب يفتح من نفس الصفحة التي توقفت عندها.</div>
                </details>
                <details class="clean-accordion">
                    <summary><span>كيف يتم الربط السحابي للشخصيات العامة والمؤلفين؟</span><i class="ri-arrow-down-s-line acc-arrow"></i></summary>
                    <div class="accordion-body">يُتاح للجميع المساهمة بتوثيق مؤلفات الشخصيات العامة والأعلام الراحلين (مثل البردوني والمقالح وغيرهم) مباشرة من صفحاتهم، ويرفض النظام تلقائياً أي كتاب مكرر.</div>
                </details>
            </div>
        `;
        $("infoModal").style.display = "flex";
    };
}

if ($("closeInfoModal")) $("closeInfoModal").onclick = () => $("infoModal").style.display = "none";

// دعم تثبيت التطبيق الرسمي الآمن (WebAPK بدون تحذير Play Protect)
let deferredPwaPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    if ($("pwaInstallStatusSub")) {
        $("pwaInstallStatusSub").textContent = "التطبيق جاهز للتثبيت المباشر والآمن بضغطة واحدة";
    }
});

if ($("installPwaBtn")) {
    $("installPwaBtn").onclick = async () => {
        if (deferredPwaPrompt) {
            deferredPwaPrompt.prompt();
            await deferredPwaPrompt.userChoice;
            deferredPwaPrompt = null;
        } else {
            alert("لتثبيت تطبيق الحجرية الرسمي بأمان تام:\n• في أندرويد (Chrome): افتح قائمة المتصفح (⋮) واختر «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق».\n• في آيفون (Safari): اضغط زر المشاركة ثم اختر «إضافة إلى الصفحة الرئيسية».");
        }
    };
}

// الانطلاق
fetchAllEncyclopediaData();
