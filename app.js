import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============================================================================
// 1. تهيئة فايربيس والثوابت الأساسية
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

const $ = (id) => document.getElementById(id);

function isUserAdmin(user) {
    return Boolean(user && user.email && ADMIN_EMAILS.includes(user.email.trim().toLowerCase()));
}

// حالة النظام
let currentUser = null;
let isAdmin = false;
let allBooks = [];
let allReviews = [];
let allReviewReplies = [];
let allAuthors = [];
let allPublishers = [];
let allReports = [];
let allAuditLogs = [];
let bookOverrides = {};
let userFavorites = [];

let activeCategory = "all";
let activeCountry = "all";
let activeEra = "all";
let activePubScope = "all";
let activeMyUploadsFilter = "all";
let currentOpenBook = null;
let currentOpenAuthorName = "";
let initialDeepLinkHandled = false;

// ============================================================================
// 2. الخوارزمية الصامتة في الخلفية (تخصيص الترتيب حسب اهتمام المستخدم بدون إشعارات)
// ============================================================================
let aiProfile = JSON.parse(localStorage.getItem("hujariya_silent_ai") || '{"categories":{},"authors":{},"countries":{},"eras":{},"queries":[]}');

function trackSilentSignal(type, value, weight = 1) {
    if (!value) return;
    if (type === "query") {
        const q = value.trim().toLowerCase();
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
    const normAuth = normalizeArabic(book.author);
    const cat = normalizeCategory(book.category);
    const country = book.country || "اليمن";

    score += (aiProfile.categories[cat] || 0) * 4;
    score += (aiProfile.authors[normAuth] || 0) * 6;
    score += (aiProfile.countries[country] || 0) * 2;
    score += (aiProfile.eras[book.era] || 0) * 1.5;

    if (userFavorites.includes(book.id)) score += 3;

    aiProfile.queries.forEach(q => {
        if ((book.title || "").toLowerCase().includes(q) || (book.author || "").toLowerCase().includes(q)) {
            score += 5;
        }
    });

    score += (book.ratingCount || 0) * 0.8;
    // عامل زمني خفيف لدمج الحداثة مع الاهتمامات الشخصية
    const ageScore = (book.createdAt || 0) / 1e12;
    return score + ageScore;
}

// ============================================================================
// 3. دوال مساعدة: الروابط المباشرة، ضغط الصور، تطبيع النصوص، و SEO
// ============================================================================
function normalizeArabic(text) {
    if (!text) return "";
    return text.trim().toLowerCase()
        .replace(/[\u064B-\u065F]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/^(ال|روايه|رواية|كتاب|ديوان|مؤلف)\s+/g, "")
        .replace(/\s+/g, " ");
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

function toEmbedDrivePreview(url) {
    const id = extractDriveFileId(url);
    return id ? `https://drive.google.com/file/d/${id}/preview` : url;
}

// تحديث بيانات Schema.org ومحركات البحث والذكاء الاصطناعي (SEO & AIO)
function updateSeoAndUrl(book = null, author = null, pushUrl = true) {
    const schemaEl = $("dynamicJsonLd");
    if (book) {
        const directUrl = getBookDirectUrl(book.id);
        document.title = `${book.title} - ${book.author} | مكتبة الحجرية`;
        if (pushUrl) window.history.replaceState({ bookId: book.id }, "", `?book=${encodeURIComponent(book.id)}`);
        if (schemaEl) {
            schemaEl.textContent = JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Book",
                "name": book.title,
                "author": { "@type": "Person", "name": book.author },
                "publisher": book.publisher ? { "@type": "Organization", "name": book.publisher } : undefined,
                "description": book.description,
                "image": book.coverUrl,
                "url": directUrl,
                "inLanguage": "ar",
                "genre": normalizeCategory(book.category)
            });
        }
    } else if (author) {
        const directUrl = getAuthorDirectUrl(author.name);
        document.title = `${author.name} | مكتبة وموسوعة الحجرية`;
        if (pushUrl) window.history.replaceState({ authorName: author.name }, "", `?author=${encodeURIComponent(author.name)}`);
        if (schemaEl) {
            schemaEl.textContent = JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Person",
                "name": author.name,
                "description": author.bio,
                "image": author.photoUrl,
                "url": directUrl
            });
        }
    } else {
        document.title = "مكتبة الحجرية | الموسوعة العربية والوطنية لتوثيق المؤلفات والكتّاب";
        if (pushUrl && (window.location.search.includes("book=") || window.location.search.includes("author="))) {
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
// 4. التحكم بالإشعار العلوي القابل للإخفاء، الوصف المنسدل، والفلاتر
// ============================================================================
function initTopNoticeAndCollapsibles() {
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

    // انسدال وصف "موسوعة ومكتبة الحجرية" عند لمس العنوان
    if ($("toggleBrandDescBtn") && $("brandCollapsibleBox")) {
        $("toggleBrandDescBtn").addEventListener("click", () => {
            const box = $("brandCollapsibleBox");
            const isOpen = box.style.display !== "none";
            box.style.display = isOpen ? "none" : "block";
            $("toggleBrandDescBtn").classList.toggle("open", !isOpen);
        });
    }

    // انسدال درج الفلاتر (البلد + الحقبة الزمنية)
    if ($("toggleFiltersDrawerBtn") && $("advancedFiltersDrawer")) {
        $("toggleFiltersDrawerBtn").addEventListener("click", () => {
            const drawer = $("advancedFiltersDrawer");
            const isOpen = drawer.style.display !== "none";
            drawer.style.display = isOpen ? "none" : "block";
            $("toggleFiltersDrawerBtn").classList.toggle("active", !isOpen);
        });
    }
}
initTopNoticeAndCollapsibles();

// الوضع الليلي والنهاري
function applyThemeMode(isDark) {
    document.body.classList.toggle("dark-mode", isDark);
    document.body.classList.toggle("light-mode", !isDark);
    if ($("darkModeToggle")) $("darkModeToggle").checked = isDark;
    localStorage.setItem("hujariya_theme", isDark ? "dark" : "light");
}
applyThemeMode(localStorage.getItem("hujariya_theme") === "dark");

if ($("darkModeToggle")) {
    $("darkModeToggle").addEventListener("change", (e) => applyThemeMode(e.target.checked));
}
if ($("quickThemeToggle")) {
    $("quickThemeToggle").addEventListener("click", () => applyThemeMode(!document.body.classList.contains("dark-mode")));
}

// التنقل بين الصفحات
function navigateToPage(targetId, keepSeoUrl = false) {
    document.querySelectorAll(".samsung-nav-btn[data-target]").forEach(btn => {
        const navTarget = btn.getAttribute("data-target");
        const isActive = navTarget === targetId ||
            (targetId === "bookDetailPageView" && navTarget === "shelvesView") ||
            (targetId === "authorDetailPageView" && navTarget === "authorsView");
        btn.classList.toggle("active", isActive);
    });

    document.querySelectorAll(".view-page").forEach(page => {
        page.classList.toggle("active-page", page.id === targetId);
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
    if (!keepSeoUrl) updateSeoAndUrl(null, null, true);
}

document.querySelectorAll(".samsung-nav-btn[data-target]").forEach(btn => {
    btn.addEventListener("click", () => navigateToPage(btn.getAttribute("data-target")));
});

if ($("brandHomeLogoBtn")) {
    $("brandHomeLogoBtn").addEventListener("click", () => navigateToPage("shelvesView"));
}
if ($("backFromBookPageBtn")) {
    $("backFromBookPageBtn").addEventListener("click", () => navigateToPage("shelvesView"));
}
if ($("backFromAuthorPageBtn")) {
    $("backFromAuthorPageBtn").addEventListener("click", () => navigateToPage("authorsView"));
}

// التبويبات الفرعية
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
// 5. نظام المصادقة وحساب المستخدم وأوسمة الشرف
// ============================================================================
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    isAdmin = isUserAdmin(user);

    const authBtn = $("authActionBtn");
    if (user) {
        authBtn.innerHTML = `<i class="ri-logout-box-r-line"></i><span>تسجيل الخروج</span>`;
        authBtn.style.background = "var(--danger)";
        $("profileName").textContent = isAdmin ? `${user.displayName} (الإدارة)` : user.displayName;
        $("profileEmail").textContent = user.email;
        $("profileAvatar").src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || "U")}&background=142622&color=c4924c`;

        $("adminBadgeIcon").style.display = isAdmin ? "flex" : "none";
        $("adminNavBtn").style.display = isAdmin ? "flex" : "none";

        await loadUserData(user.uid);
    } else {
        authBtn.innerHTML = `<i class="ri-google-fill"></i><span>تسجيل الدخول بحساب جوجل</span>`;
        authBtn.style.background = "";
        $("profileName").textContent = "زائر مكتبة الحجرية";
        $("profileEmail").textContent = "سجل دخولك لحفظ الكتب وتوثيق المؤلفات والمشاركة في النقاشات";
        $("profileAvatar").src = "https://ui-avatars.com/api/?name=H&background=142622&color=c4924c";

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

async function loadUserData(uid) {
    try {
        const ref = doc(db, "users", uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            const data = snap.data();
            userFavorites = data.favorites || [];
            if (data.hideNotice) {
                localStorage.setItem("hujariya_hide_notice", "1");
                if ($("nonprofitNoticeBar")) $("nonprofitNoticeBar").style.display = "none";
            }
        } else {
            await setDoc(ref, {
                name: currentUser.displayName,
                email: currentUser.email,
                photoURL: currentUser.photoURL || "",
                favorites: []
            });
            userFavorites = [];
        }
    } catch (e) {
        console.error(e);
    }
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
// 6. جلب البيانات الشاملة من Firestore ومعالجة الروابط المباشرة (Deep Links)
// ============================================================================
async function fetchAllEncyclopediaData() {
    try {
        const [booksSnap, recordsSnap] = await Promise.all([
            getDocs(collection(db, "books")),
            getDocs(collection(db, "reviews"))
        ]);

        allReviews = [];
        allReviewReplies = [];
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

        syncImplicitEntities();
        populateDatalists();
        renderAllViews();

        // فتح الكتاب أو الكاتب مباشرة إذا دخل الزائر عبر رابط مشاركة أو استشهاد أكاديمي
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

    if (bookId) {
        const targetBook = allBooks.find(b => b.id === bookId);
        if (targetBook) {
            openBookPage(targetBook);
            return;
        }
    }
    if (authorName) {
        openAuthorPage(authorName);
    }
}

window.addEventListener("popstate", () => handleUrlDeepLinks());

function syncImplicitEntities() {
    const knownAuthors = new Set(allAuthors.map(a => normalizeArabic(a.name)));
    allBooks.forEach(b => {
        const normA = normalizeArabic(b.author);
        if (normA && !knownAuthors.has(normA)) {
            knownAuthors.add(normA);
            allAuthors.push({
                id: "implicit_" + normA,
                isImplicit: true,
                name: b.author,
                country: b.country || "اليمن",
                bio: b.authorBio || "مؤلف وكاتب موثق في أرشيف مكتبة وموسوعة الحجرية.",
                photoUrl: b.authorPhotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.author)}&background=142622&color=c4924c&size=200`,
                userId: b.addedByUid || ""
            });
        }
    });

    const knownPubs = new Set(allPublishers.map(p => normalizeArabic(p.name)));
    allBooks.forEach(b => {
        if (b.publisher) {
            const normP = normalizeArabic(b.publisher);
            if (normP && !knownPubs.has(normP)) {
                knownPubs.add(normP);
                allPublishers.push({
                    id: "implicit_pub_" + normP,
                    isImplicit: true,
                    name: b.publisher,
                    scope: (b.country && b.country !== "اليمن") ? "عربية / خارجية" : "يمنية",
                    city: b.cityYear || b.country || "اليمن",
                    bio: "دار نشر مدرجة ضمن الإصدارات الموثقة في مكتبة الحجرية.",
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
// 7. عرض الرفوف النظيفة، الأعداد المدمجة في التبويبات، والترتيب الخوارزمي الخفي
// ============================================================================
function renderAllViews() {
    updateTabCounters();
    updateUserBadge();
    renderMainBookshelf();
    renderAuthorsAndPublishersDirectory();
    if (currentUser) renderMyLibraryView();
    if (isAdmin) renderAdminDashboard();
}

function updateTabCounters() {
    const published = allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download");
    const yemeniBooks = published.filter(b => !b.country || b.country === "اليمن" || b.category === "تاريخ وتراث يمني");

    if ($("countCatAll")) $("countCatAll").textContent = published.length;
    if ($("countCatYemen")) $("countCatYemen").textContent = yemeniBooks.length;
    if ($("dirAuthorsCountBadge")) $("dirAuthorsCountBadge").textContent = allAuthors.length;
    if ($("dirPublishersCountBadge")) {
        $("dirPublishersCountBadge").textContent = allPublishers.filter(p => p.status !== "rejected").length;
    }
}

// البحث والفلاتر
if ($("searchInput")) {
    $("searchInput").addEventListener("input", (e) => {
        const val = e.target.value;
        $("clearSearchBtn").style.display = val ? "flex" : "none";
        if (val.trim().length > 2) trackSilentSignal("query", val.trim());
        renderMainBookshelf();
    });
}

if ($("clearSearchBtn")) {
    $("clearSearchBtn").addEventListener("click", () => {
        $("searchInput").value = "";
        $("clearSearchBtn").style.display = "none";
        renderMainBookshelf();
    });
}

document.querySelectorAll(".cat-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".cat-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        activeCategory = tab.getAttribute("data-cat");
        if (activeCategory !== "all" && activeCategory !== "yemeni_archive") {
            trackSilentSignal("categories", activeCategory, 1);
        }
        tab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        if (!document.getElementById("shelvesView").classList.contains("active-page")) {
            navigateToPage("shelvesView");
        }
        renderMainBookshelf();
    });
});

document.querySelectorAll("#countryFilterBar .mini-pill").forEach(pill => {
    pill.addEventListener("click", () => {
        document.querySelectorAll("#countryFilterBar .mini-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        activeCountry = pill.getAttribute("data-country");
        if (activeCountry !== "all") trackSilentSignal("countries", activeCountry, 1);
        renderMainBookshelf();
    });
});

document.querySelectorAll("#timelineFilterBar .mini-pill").forEach(pill => {
    pill.addEventListener("click", () => {
        document.querySelectorAll("#timelineFilterBar .mini-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        activeEra = pill.getAttribute("data-era");
        if (activeEra !== "all") trackSilentSignal("eras", activeEra, 1);
        renderMainBookshelf();
    });
});

function renderMainBookshelf() {
    const q = ($("searchInput")?.value || "").trim().toLowerCase();
    const grid = $("mainBookshelf");
    if (!grid) return;
    grid.innerHTML = "";

    const published = allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download");

    const filtered = published.filter(b => {
        const bCat = normalizeCategory(b.category);
        const bCountry = b.country || "اليمن";

        const matchQ = !q ||
            (b.title || "").toLowerCase().includes(q) ||
            (b.author || "").toLowerCase().includes(q) ||
            (b.publisher || "").toLowerCase().includes(q) ||
            (b.cityYear || "").toLowerCase().includes(q) ||
            bCountry.toLowerCase().includes(q);

        let matchCat = true;
        if (activeCategory === "yemeni_archive") {
            matchCat = bCountry === "اليمن" || b.category === "تاريخ وتراث يمني";
        } else if (activeCategory === "صوت المؤلف") {
            matchCat = Boolean(b.audioUrl);
        } else if (activeCategory !== "all") {
            matchCat = bCat === activeCategory;
        }

        const matchCountry = activeCountry === "all" || bCountry === activeCountry;
        const matchEra = activeEra === "all" || (b.era || "الألفية الحديثة") === activeEra;

        return matchQ && matchCat && matchCountry && matchEra;
    });

    // ترتيب الكتب في الخلفية بصمت تام حسب اهتمامات القارئ وسلوكه
    filtered.sort((a, b) => computeSilentBookScore(b) - computeSilentBookScore(a));

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:50px 20px; background:var(--bg-surface); border-radius:16px; border:1px dashed var(--border-color);">
                <i class="ri-book-2-line" style="font-size:2.5rem; color:var(--accent);"></i>
                <h4 style="margin:8px 0 4px;">لا توجد مؤلفات مطابقة</h4>
                <p class="muted-hint">جرّب تغيير التصنيف أو أضف هذا المؤلف عبر زر «نشر كتاب»</p>
            </div>
        `;
        return;
    }

    filtered.forEach(book => grid.appendChild(createCleanBookCard(book)));
}

// بطاقة الكتاب الخارجية النظيفة (الغلاف + اسم الكتاب + اسم الكاتب فقط)
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
// 8. صفحة الكتاب المستقلة المبنية على القوائم المنسدلة (Accordions) والردود التفاعلية
// ============================================================================
function canUserEditBook(book) {
    if (!currentUser) return false;
    if (isAdmin || book.addedByUid === currentUser.uid) return true;
    if (book.publisher) {
        const normP = normalizeArabic(book.publisher);
        return allPublishers.some(p => p.verified && p.userId === currentUser.uid && normalizeArabic(p.name) === normP);
    }
    return false;
}

function openBookPage(book) {
    currentOpenBook = book;
    trackSilentSignal("categories", normalizeCategory(book.category), 2);
    trackSilentSignal("authors", normalizeArabic(book.author), 3);
    trackSilentSignal("countries", book.country || "اليمن", 1);
    if (book.era) trackSilentSignal("eras", book.era, 1);

    updateSeoAndUrl(book, null, true);
    navigateToPage("bookDetailPageView", true);

    const isFav = userFavorites.includes(book.id);
    const avg = book.ratingCount > 0 ? (book.ratingSum / book.ratingCount).toFixed(1) : "جديد";
    const bookReviews = allReviews.filter(r => r.bookId === book.id).sort((a, b) => b.createdAt - a.createdAt);

    const contributorCount = allBooks.filter(b =>
        b.addedByUid === book.addedByUid &&
        (b.status === "published_full" || b.status === "published_no_download")
    ).length;
    const contributorRank = getContributorRank(contributorCount);
    const contributorAvatar = book.addedByPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(book.addedByName || "م")}&background=142622&color=c4924c`;

    const hasDriveFile = book.status === "published_full" && Boolean(book.downloadLink);
    const userCanEdit = canUserEditBook(book);

    // روابط الاستشهاد الأكاديمي المباشرة للكتاب نفسه
    const directBookUrl = getBookDirectUrl(book.id);
    const pubYear = (book.cityYear && book.cityYear.match(/\d{4}/)?.[0]) || new Date(book.createdAt || Date.now()).getFullYear();
    const pubName = book.publisher || "مكتبة وموسوعة الحجرية";
    const apaCitation = `${book.author}. (${pubYear}). ${book.title}. ${pubName}. مسترجع من: ${directBookUrl}`;
    const mlaCitation = `${book.author}. "${book.title}." ${pubName}، ${pubYear}. ${directBookUrl}`;
    const shareText = `📚 كتاب «${book.title}» للمؤلف «${book.author}»\nتصفح الكتاب في مكتبة الحجرية:\n${directBookUrl}`;

    // الكتب المرتبطة لنفس الكاتب وكتب مشابهة
    const normAuth = normalizeArabic(book.author);
    const sameAuthorBooks = allBooks.filter(b =>
        b.id !== book.id &&
        (b.status === "published_full" || b.status === "published_no_download") &&
        normalizeArabic(b.author) === normAuth
    );
    const similarBooks = allBooks.filter(b =>
        b.id !== book.id &&
        (b.status === "published_full" || b.status === "published_no_download") &&
        normalizeArabic(b.author) !== normAuth &&
        normalizeCategory(b.category) === normalizeCategory(book.category)
    ).slice(0, 8);

    const container = $("bookPageContentContainer");
    container.innerHTML = `
        <!-- البطاقة العلوية للكتاب -->
        <div class="book-hero-card">
            <div class="book-hero-top">
                <img src="${escapeHtml(book.coverUrl)}" alt="${escapeHtml(book.title)}" class="book-hero-cover">
                <div class="book-hero-info">
                    <div class="book-tags-row">
                        <span class="soft-tag">${escapeHtml(normalizeCategory(book.category))}</span>
                        <span class="soft-tag">${escapeHtml(book.country || "اليمن")}</span>
                        ${book.era ? `<span class="soft-tag">${escapeHtml(book.era)}</span>` : ""}
                        <span class="soft-tag" style="color:#d97706;">★ ${avg} (${book.ratingCount || 0})</span>
                    </div>

                    <h1>${escapeHtml(book.title)}</h1>

                    <button type="button" id="pageAuthorChipBtn" class="author-link-chip">
                        <i class="ri-quill-pen-fill" style="color:var(--accent);"></i>
                        <span>${escapeHtml(book.author)}</span>
                        <i class="ri-arrow-left-s-line"></i>
                    </button>

                    <!-- الأزرار الرئيسية للكتاب -->
                    <div class="book-primary-actions">
                        ${hasDriveFile ? `
                            <button type="button" id="pageReadPdfBtn" class="btn-primary-main">
                                <i class="ri-book-read-fill"></i><span>قراءة الكتاب</span>
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

        <!-- القوائم المنسدلة المنظمة (Accordions) لجميع تفاصيل وميزات الكتاب -->
        <div class="accordion-group">

            <!-- 1. القائمة المنسدلة لوصف الكتاب وركن صوت المؤلف -->
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

            <!-- 2. القائمة المنسدلة لبيانات النشر وبطاقة المساهم -->
            <details class="clean-accordion">
                <summary>
                    <span><i class="ri-medal-line"></i> بطاقة التوثيق، دار النشر، والمساهم</span>
                    <i class="ri-arrow-down-s-line acc-arrow"></i>
                </summary>
                <div class="accordion-body">
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-bottom:14px;">
                        <div style="background:var(--bg-main); padding:10px 12px; border-radius:10px;">
                            <small class="muted-hint">دار النشر</small>
                            <strong style="display:block; font-size:0.88rem;">${escapeHtml(book.publisher || "نشر خاص / غير محدد")}</strong>
                        </div>
                        <div style="background:var(--bg-main); padding:10px 12px; border-radius:10px;">
                            <small class="muted-hint">المدينة وسنة الإصدار</small>
                            <strong style="display:block; font-size:0.88rem;">${escapeHtml(book.cityYear || book.country || "غير محدد")}</strong>
                        </div>
                    </div>

                    <!-- بطاقة المساهم التحفيزية -->
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
                        <div style="margin-top:12px; padding:12px; border:1px dashed var(--accent); border-radius:10px; background:var(--accent-soft);">
                            <strong style="display:block; font-size:0.82rem; margin-bottom:8px;"><i class="ri-vip-crown-fill"></i> صلاحيات الإدارة السريعة:</strong>
                            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                                <button type="button" id="admQuickToggleDl" class="btn-primary-main" style="padding:6px 12px; font-size:0.76rem;">
                                    ${book.status === 'published_full' ? 'إيقاف التحميل (تحويل لموسوعي)' : 'تفعيل التحميل والقراءة'}
                                </button>
                                <button type="button" id="admQuickSuspend" class="btn-accent-sm" style="background:var(--warning);">
                                    ${book.status === 'suspended' ? 'إلغاء التعليق' : 'تعليق / تقييد مؤقت'}
                                </button>
                                <button type="button" id="admQuickDelete" class="btn-primary-main" style="background:var(--danger); padding:6px 12px; font-size:0.76rem;">
                                    حذف نهائي
                                </button>
                            </div>
                        </div>
                    ` : ""}
                </div>
            </details>

            <!-- 3. القائمة المنسدلة للاستشهاد الأكاديمي (APA / MLA) والمشاركة بالرابط المباشر للكتاب -->
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

            <!-- 4. القائمة المنسدلة للمراجعات والنقاشات والردود التفاعلية (Threaded Replies) -->
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

        <!-- الرفوف الأفقية المترابطة أسفل الصفحة -->
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

    // بناء شجرة المراجعات والردود المتسلسلة (Threaded Replies)
    renderReviewsWithReplies(book, bookReviews);

    // تعبئة الرفوف الأفقية
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

    // ربط الأحداث
    $("pageAuthorChipBtn").onclick = () => openAuthorPage(book.author);

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
        $("pageReadPdfBtn").onclick = () => {
            $("pdfReaderTitle").innerHTML = `<i class="ri-book-read-line"></i> ${escapeHtml(book.title)}`;
            $("pdfViewerFrame").src = toEmbedDrivePreview(book.downloadLink);
            $("pdfReaderModal").style.display = "flex";
        };
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

    if ($("pageEditBookBtn")) {
        $("pageEditBookBtn").onclick = () => openBookFormModal(book);
    }

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

// عرض المراجعات مع ميزة الرد على المساهمات (Threaded Replies)
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
// 9. صفحة المؤلف المستقلة + دليل المؤلفين ودور النشر (اليمنية والعربية)
// ============================================================================
function openAuthorPage(authorName) {
    currentOpenAuthorName = authorName;
    const normTarget = normalizeArabic(authorName);
    let authorObj = allAuthors.find(a => normalizeArabic(a.name) === normTarget);
    if (!authorObj) {
        authorObj = {
            id: "implicit_" + normTarget,
            isImplicit: true,
            name: authorName,
            country: "اليمن",
            bio: "مؤلف وكاتب موثق في مكتبة وموسوعة الحجرية.",
            photoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=142622&color=c4924c`,
            userId: ""
        };
    }

    trackSilentSignal("authors", normTarget, 2);
    updateSeoAndUrl(null, authorObj, true);
    navigateToPage("authorDetailPageView", true);

    const authorBooks = allBooks.filter(b =>
        normalizeArabic(b.author) === normTarget &&
        (b.status === "published_full" || b.status === "published_no_download")
    );

    const canEditAuthor = isAdmin || (currentUser && authorObj.userId && authorObj.userId === currentUser.uid);
    const photo = authorObj.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorObj.name)}&background=142622&color=c4924c`;

    const container = $("authorPageContentContainer");
    container.innerHTML = `
        <div class="book-hero-card">
            <div style="display:flex; gap:18px; align-items:center; flex-wrap:wrap;">
                <img src="${escapeHtml(photo)}" style="width:90px; height:90px; border-radius:50%; object-fit:cover; border:2.5px solid var(--accent);">
                <div style="flex:1; min-width:200px;">
                    <span class="soft-tag">${escapeHtml(authorObj.country || "كاتب ومؤلف")}</span>
                    <h2 style="font-family:'Amiri',serif; font-size:1.6rem; margin:6px 0;">${escapeHtml(authorObj.name)}</h2>
                    <p class="muted-hint" style="color:var(--text-main); line-height:1.7;">${escapeHtml(authorObj.bio)}</p>
                    ${canEditAuthor ? `
                        <button type="button" id="editAuthorPageBtn" class="btn-ghost-main" style="margin-top:10px; padding:6px 12px; font-size:0.78rem;">
                            <i class="ri-edit-line"></i> تحديث السيرة أو الصورة
                        </button>
                    ` : ""}
                </div>
            </div>
        </div>

        <h3 style="font-size:1.05rem; margin-bottom:14px;"><i class="ri-book-2-line" style="color:var(--accent);"></i> مؤلفات «${escapeHtml(authorObj.name)}» (${authorBooks.length})</h3>
        <div id="authorPageBooksGrid" class="clean-books-grid"></div>
    `;

    const grid = $("authorPageBooksGrid");
    if (authorBooks.length === 0) {
        grid.innerHTML = `<p class="muted-hint">لا توجد مؤلفات منشورة حالياً.</p>`;
    } else {
        authorBooks.forEach(b => grid.appendChild(createCleanBookCard(b)));
    }

    if (canEditAuthor && $("editAuthorPageBtn")) {
        $("editAuthorPageBtn").onclick = () => openAddOrEditAuthorModal(authorObj);
    }

    if ($("shareAuthorDirectLinkBtn")) {
        $("shareAuthorDirectLinkBtn").onclick = async () => {
            const url = getAuthorDirectUrl(authorObj.name);
            if (navigator.share) {
                try { await navigator.share({ title: authorObj.name, url }); return; } catch (e) {}
            }
            navigator.clipboard.writeText(url);
            alert("تم نسخ رابط صفحة المؤلف!");
        };
    }
}

// فلتر نطاق دور النشر (يمنية / عربية وخارجية)
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

    authorsGrid.innerHTML = "";
    pubsGrid.innerHTML = "";

    const publishedBooks = allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download");

    allAuthors.forEach(author => {
        const normName = normalizeArabic(author.name);
        const count = publishedBooks.filter(b => normalizeArabic(b.author) === normName).length;
        const photo = author.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(author.name)}&background=142622&color=c4924c`;

        const card = document.createElement("div");
        card.className = "dir-entity-card";
        card.innerHTML = `
            <img src="${escapeHtml(photo)}" class="dir-entity-avatar" alt="${escapeHtml(author.name)}">
            <div class="dir-entity-info">
                <h4>${escapeHtml(author.name)}</h4>
                <p>${escapeHtml(author.bio || "مؤلف وكاتب")}</p>
                <span class="soft-tag">${count} كتاب</span>
            </div>
        `;
        card.onclick = () => openAuthorPage(author.name);
        authorsGrid.appendChild(card);
    });

    const visiblePubs = allPublishers.filter(p => {
        if (p.status === "rejected") return false;
        const scope = p.scope || "يمنية";
        return activePubScope === "all" || scope === activePubScope;
    });

    if (visiblePubs.length === 0) {
        pubsGrid.innerHTML = `<p class="muted-hint">لا توجد دور نشر في هذا القسم حالياً.</p>`;
    } else {
        visiblePubs.forEach(pub => {
            const normP = normalizeArabic(pub.name);
            const count = publishedBooks.filter(b => normalizeArabic(b.publisher) === normP).length;
            const logo = pub.logoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(pub.name)}&background=c4924c&color=fff`;

            const card = document.createElement("div");
            card.className = "dir-entity-card";
            card.innerHTML = `
                <img src="${escapeHtml(logo)}" class="dir-entity-avatar" alt="${escapeHtml(pub.name)}">
                <div class="dir-entity-info">
                    <h4>
                        ${escapeHtml(pub.name)}
                        ${pub.verified ? `<i class="ri-verified-badge-fill" style="color:var(--accent);" title="دار نشر موثقة"></i>` : ""}
                    </h4>
                    <p>${escapeHtml(pub.bio || pub.city || "")}</p>
                    <span class="soft-tag">${escapeHtml(pub.scope || "يمنية")} • ${count} إصدار</span>
                </div>
            `;
            card.onclick = () => {
                $("searchInput").value = pub.name;
                $("clearSearchBtn").style.display = "flex";
                navigateToPage("shelvesView");
                renderMainBookshelf();
            };
            pubsGrid.appendChild(card);
        });
    }
}

// إضافة أو تعديل مؤلف
function openAddOrEditAuthorModal(existingAuthor = null) {
    if (!currentUser) {
        alert("يرجى تسجيل الدخول أولاً.");
        navigateToPage("profileView");
        return;
    }

    $("addEntityModalTitle").innerHTML = `<i class="ri-quill-pen-line"></i> ${existingAuthor ? "تحديث بطاقة المؤلف" : "إضافة مؤلف جديد"}`;
    $("addEntityModalBody").innerHTML = `
        <div class="input-group">
            <label>اسم المؤلف *</label>
            <input type="text" id="entityAuthorName" value="${escapeHtml(existingAuthor?.name || "")}" ${existingAuthor && !existingAuthor.isImplicit ? "readonly" : ""}>
        </div>
        <div class="input-group">
            <label>البلد / القطر العربي *</label>
            <select id="entityAuthorCountry">
                <option value="اليمن">🇾🇪 اليمن</option>
                <option value="السعودية">🇸🇦 السعودية</option>
                <option value="مصر">🇪🇬 مصر</option>
                <option value="الشام والعراق">🏛️ الشام والعراق</option>
                <option value="الخليج العربي">🌊 الخليج العربي</option>
                <option value="المغرب العربي">🌍 المغرب العربي</option>
            </select>
        </div>
        <div class="input-group">
            <label>السيرة الذاتية والنبذة *</label>
            <textarea id="entityAuthorBio" rows="4">${escapeHtml(existingAuthor?.bio || "")}</textarea>
        </div>
        <div class="input-group">
            <label>صورة المؤلف (اختياري)</label>
            <input type="file" id="entityAuthorPhoto" accept="image/*">
        </div>
        <div id="entityStatusMsg" class="status-msg"></div>
        <button type="button" id="saveAuthorEntityBtn" class="btn-primary-main w-100">حفظ بيانات المؤلف</button>
    `;

    $("saveAuthorEntityBtn").onclick = async () => {
        const name = $("entityAuthorName").value.trim();
        const country = $("entityAuthorCountry").value;
        const bio = $("entityAuthorBio").value.trim();
        const file = $("entityAuthorPhoto").files[0];
        const msg = $("entityStatusMsg");
        const btn = $("saveAuthorEntityBtn");

        if (!name || !bio) {
            msg.style.color = "var(--danger)";
            msg.textContent = "يرجى إدخال الاسم والنبذة.";
            return;
        }

        btn.disabled = true;
        msg.textContent = "جاري الحفظ...";

        try {
            let photoUrl = existingAuthor?.photoUrl || "";
            if (file) photoUrl = await compressAndUploadImage(file, 450, 0.8);

            if (existingAuthor && !existingAuthor.isImplicit) {
                await updateDoc(doc(db, "reviews", existingAuthor.id), { name, country, bio, photoUrl, updatedAt: Date.now() });
            } else {
                await addDoc(collection(db, "reviews"), {
                    recordType: "author",
                    name, country, bio, photoUrl,
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

if ($("openNewAuthorModalBtn")) $("openNewAuthorModalBtn").onclick = () => openAddOrEditAuthorModal(null);
if ($("closeAddEntityModal")) $("closeAddEntityModal").onclick = () => $("addEntityModal").style.display = "none";

// إضافة أو توثيق دار نشر (يمنية أو عربية/خارجية)
if ($("openNewPublisherModalBtn")) {
    $("openNewPublisherModalBtn").onclick = () => {
        if (!currentUser) {
            alert("يرجى تسجيل الدخول أولاً.");
            navigateToPage("profileView");
            return;
        }

        $("addEntityModalTitle").innerHTML = `<i class="ri-building-2-line"></i> إضافة / توثيق دار نشر`;
        $("addEntityModalBody").innerHTML = `
            <div class="input-group">
                <label>اسم دار النشر *</label>
                <input type="text" id="pubNameInput" placeholder="مثال: دار صفقات كتابية / دار الآداب">
            </div>
            <div class="grid-2col">
                <div class="input-group">
                    <label>نطاق الدار *</label>
                    <select id="pubScopeInput">
                        <option value="يمنية">🇾🇪 دار نشر يمنية</option>
                        <option value="عربية / خارجية">🌍 دار نشر عربية / خارجية</option>
                    </select>
                </div>
                <div class="input-group">
                    <label>المدينة والمقر *</label>
                    <input type="text" id="pubCityInput" placeholder="مثال: تعز / بيروت / القاهرة">
                </div>
            </div>
            <div class="input-group">
                <label>رابط الموقع أو المعرف الرسمي للتوثيق *</label>
                <input type="text" id="pubProofInput" placeholder="رابط الصفحة الرسمية أو البريد الرسمي...">
            </div>
            <div class="input-group">
                <label>نبذة عن الدار *</label>
                <textarea id="pubBioInput" rows="3"></textarea>
            </div>
            <div class="input-group">
                <label>شعار الدار (اختياري)</label>
                <input type="file" id="pubLogoInput" accept="image/*">
            </div>
            <div id="pubStatusMsg" class="status-msg"></div>
            <button type="button" id="submitPubVerifyBtn" class="btn-primary-main w-100">إرسال وحفظ الدار</button>
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
            msg.textContent = "جاري الإرسال...";

            try {
                let logoUrl = "";
                if (file) logoUrl = await compressAndUploadImage(file, 400, 0.8);

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

                await fetchAllEncyclopediaData();
                $("addEntityModal").style.display = "none";
            } catch (e) {
                msg.textContent = "حدث خطأ، حاول مجدداً.";
                btn.disabled = false;
            }
        };

        $("addEntityModal").style.display = "flex";
    };
}

// ============================================================================
// 10. رفع وتعديل الكتب + منع التكرار
// ============================================================================
const addBookModal = $("addBookModal");

if ($("openAddModalBtn")) $("openAddModalBtn").onclick = () => openBookFormModal(null);
if ($("closeAddModal")) $("closeAddModal").onclick = () => addBookModal.style.display = "none";

if ($("toggleNewAuthorInlineBtn")) {
    $("toggleNewAuthorInlineBtn").onclick = () => {
        const box = $("inlineNewAuthorFields");
        box.style.display = box.style.display === "none" ? "block" : "none";
    };
}

if ($("bookCoverInput")) {
    $("bookCoverInput").onchange = () => {
        const f = $("bookCoverInput").files[0];
        if (f) $("selectedCoverName").textContent = `تم اختيار: ${f.name}`;
    };
}

function openBookFormModal(bookToEdit = null) {
    if (!currentUser) {
        alert("يرجى تسجيل الدخول بحساب جوجل أولاً.");
        navigateToPage("profileView");
        return;
    }

    $("editingBookId").value = bookToEdit ? bookToEdit.id : "";
    $("bookModalHeaderTitle").innerHTML = bookToEdit
        ? `<i class="ri-edit-box-line"></i> تعديل: ${escapeHtml(bookToEdit.title)}`
        : `<i class="ri-book-mark-line"></i> توثيق ونشر كتاب`;

    $("bookTitleInput").value = bookToEdit ? bookToEdit.title : "";
    $("bookAuthorInput").value = bookToEdit ? bookToEdit.author : "";
    $("bookCategoryInput").value = bookToEdit ? normalizeCategory(bookToEdit.category) : "روايات وأدب";
    $("bookCountryInput").value = bookToEdit?.country || "اليمن";
    $("bookEraInput").value = bookToEdit?.era || "الألفية الحديثة";
    $("bookPublisherInput").value = bookToEdit?.publisher || "";
    $("bookCityYearInput").value = bookToEdit?.cityYear || "";
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

    $("duplicateWarningBox").style.display = "none";
    $("uploadStatusMsg").textContent = "";
    addBookModal.style.display = "flex";
}

function checkDuplicateRealtime() {
    const editingId = $("editingBookId").value;
    const normT = normalizeArabic($("bookTitleInput").value);
    const normA = normalizeArabic($("bookAuthorInput").value);
    const warnBox = $("duplicateWarningBox");

    if (!normT || !normA) {
        warnBox.style.display = "none";
        return null;
    }

    const dup = allBooks.find(b =>
        b.id !== editingId &&
        normalizeArabic(b.title) === normT &&
        normalizeArabic(b.author) === normA
    );

    if (dup) {
        warnBox.style.display = "block";
        warnBox.innerHTML = `<i class="ri-error-warning-fill"></i> كتاب «${escapeHtml(dup.title)}» للمؤلف «${escapeHtml(dup.author)}» مسجل مسبقاً!`;
        return dup;
    }
    warnBox.style.display = "none";
    return null;
}

if ($("bookTitleInput")) $("bookTitleInput").oninput = checkDuplicateRealtime;
if ($("bookAuthorInput")) $("bookAuthorInput").oninput = checkDuplicateRealtime;

if ($("submitBookBtn")) {
    $("submitBookBtn").onclick = async () => {
        const editingId = $("editingBookId").value;
        const existingBook = editingId ? allBooks.find(b => b.id === editingId) : null;

        const title = $("bookTitleInput").value.trim();
        const author = $("bookAuthorInput").value.trim();
        const category = $("bookCategoryInput").value;
        const country = $("bookCountryInput").value;
        const era = $("bookEraInput").value;
        const publisher = $("bookPublisherInput").value.trim();
        const cityYear = $("bookCityYearInput").value.trim();
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
        msg.textContent = "جاري ضغط الغلاف ورفع البيانات...";

        try {
            let coverUrl = existingBook ? existingBook.coverUrl : "";
            if (coverFile) coverUrl = await compressAndUploadImage(coverFile, 800, 0.78);

            const normAuth = normalizeArabic(author);
            const authorExists = allAuthors.some(a => !a.isImplicit && normalizeArabic(a.name) === normAuth);
            if (!authorExists && (newAuthorBio || newAuthorPhotoFile)) {
                let authorPhotoUrl = "";
                if (newAuthorPhotoFile) authorPhotoUrl = await compressAndUploadImage(newAuthorPhotoFile, 450, 0.8);
                await addDoc(collection(db, "reviews"), {
                    recordType: "author",
                    name: author,
                    country,
                    bio: newAuthorBio || `مؤلف كتاب ${title}`,
                    photoUrl: authorPhotoUrl,
                    userId: currentUser.uid,
                    userName: currentUser.displayName,
                    createdAt: Date.now()
                });
            }

            const newStatus = isAdmin
                ? (downloadLink ? "published_full" : "published_no_download")
                : "pending";

            const payload = {
                title, author, category, country, era,
                publisher, cityYear, description, downloadLink, audioUrl, coverUrl,
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
            msg.textContent = isAdmin ? "تم النشر الفوري بنجاح!" : "تم الإرسال للمراجعة! يمكنك متابعة حالته من قسم مكتبتي.";

            await fetchAllEncyclopediaData();
            setTimeout(() => {
                addBookModal.style.display = "none";
                btn.disabled = false;
            }, 1100);
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
                <option value="خطأ في بيانات الكتاب أو المؤلف">خطأ في بيانات الكتاب أو المؤلف</option>
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
// 12. مكتبتي ولوحة الإدارة ولوحة الشرف وتثبيت التطبيق الحقيقي (PWA)
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
    const savedShelf = $("savedBooksShelf");
    const uploadsShelf = $("myUploadedBooksShelf");
    const reportsList = $("myReportsTicketsList");
    if (!savedShelf || !uploadsShelf || !reportsList) return;

    savedShelf.innerHTML = "";
    uploadsShelf.innerHTML = "";
    reportsList.innerHTML = "";

    const favs = allBooks.filter(b => userFavorites.includes(b.id));
    if (favs.length === 0) savedShelf.innerHTML = `<p class="muted-hint">لا توجد كتب محفوظة بعد.</p>`;
    else favs.forEach(b => savedShelf.appendChild(createCleanBookCard(b)));

    const myBooks = allBooks.filter(b => b.addedByUid === currentUser?.uid);
    const filteredUploads = myBooks.filter(b => {
        if (activeMyUploadsFilter === "all") return true;
        if (activeMyUploadsFilter === "published") return b.status === "published_full" || b.status === "published_no_download";
        return b.status === activeMyUploadsFilter;
    });

    if (filteredUploads.length === 0) uploadsShelf.innerHTML = `<p class="muted-hint">لا توجد مساهمات في هذا القسم.</p>`;
    else filteredUploads.forEach(b => uploadsShelf.appendChild(createCleanBookCard(b, true)));

    const myReports = allReports.filter(r => r.userId === currentUser?.uid);
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
    const openReports = allReports.filter(r => r.status !== "resolved");
    const pendingPubs = allPublishers.filter(p => !p.isImplicit && p.status === "pending");

    if ($("pendingBadge")) $("pendingBadge").textContent = pendingBooks.length + openReports.length + pendingPubs.length;
    if ($("adminPendingCount")) $("adminPendingCount").textContent = pendingBooks.length;
    if ($("adminReportsCount")) $("adminReportsCount").textContent = openReports.length;
    if ($("adminPubsCount")) $("adminPubsCount").textContent = pendingPubs.length;

    const pendingContainer = $("pendingBooksList");
    if (pendingContainer) {
        pendingContainer.innerHTML = pendingBooks.length === 0 ? `<p class="muted-hint">لا توجد كتب معلقة حالياً.</p>` : "";
        pendingBooks.forEach(book => {
            const card = document.createElement("div");
            card.className = "stack-card";
            card.innerHTML = `
                <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:center;">
                    <img src="${escapeHtml(book.coverUrl)}" style="width:68px; height:100px; object-fit:cover; border-radius:8px;">
                    <div style="flex:1; min-width:200px;">
                        <span class="soft-tag">${book.status === "suspended" ? "⚠️ معلق" : "⏳ قيد المراجعة"}</span>
                        <h4 style="margin:4px 0;">${escapeHtml(book.title)} — ${escapeHtml(book.author)}</h4>
                        <p class="muted-hint">${escapeHtml(book.description)}</p>
                        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
                            <button type="button" class="btn-primary-main adm-full" style="background:var(--success); padding:6px 11px; font-size:0.76rem;">اعتماد مع التحميل</button>
                            <button type="button" class="btn-accent-sm adm-nodl">اعتماد موسوعي فقط</button>
                            <button type="button" class="btn-ghost-main adm-susp" style="padding:6px 11px; font-size:0.76rem;">تعليق</button>
                            <button type="button" class="btn-primary-main adm-rej" style="background:var(--danger); padding:6px 11px; font-size:0.76rem;">رفض</button>
                        </div>
                    </div>
                </div>
            `;
            const setSt = async (st, clearDl = false) => {
                const up = { status: st };
                if (clearDl) up.downloadLink = "";
                if (book.overrideDocId) {
                    Object.assign(up, bookOverrides[book.id].updatedFields, { status: st });
                    await deleteDoc(doc(db, "reviews", book.overrideDocId));
                }
                await updateDoc(doc(db, "books", book.id), up);
                fetchAllEncyclopediaData();
            };
            card.querySelector(".adm-full").onclick = () => setSt("published_full");
            card.querySelector(".adm-nodl").onclick = () => setSt("published_no_download", true);
            card.querySelector(".adm-susp").onclick = () => setSt("suspended");
            card.querySelector(".adm-rej").onclick = () => setSt("rejected");
            pendingContainer.appendChild(card);
        });
    }

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

    const pubsContainer = $("adminPublishersList");
    if (pubsContainer) {
        const realPubs = allPublishers.filter(p => !p.isImplicit);
        pubsContainer.innerHTML = realPubs.length === 0 ? `<p class="muted-hint">لا توجد طلبات دور نشر.</p>` : "";
        realPubs.forEach(p => {
            const d = document.createElement("div");
            d.className = "stack-card";
            d.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <span class="soft-tag">${escapeHtml(p.scope || "يمنية")}</span>
                        <h4>${escapeHtml(p.name)} (${escapeHtml(p.city)})</h4>
                        <small class="muted-hint">${escapeHtml(p.proof)}</small>
                    </div>
                    <button type="button" class="btn-accent-sm">${p.verified ? "إلغاء التوثيق" : "توثيق الدار"}</button>
                </div>
            `;
            d.querySelector("button").onclick = async () => {
                await updateDoc(doc(db, "reviews", p.id), { verified: !p.verified, status: !p.verified ? "approved" : "pending" });
                fetchAllEncyclopediaData();
            };
            pubsContainer.appendChild(d);
        });
    }

    const auditContainer = $("adminAuditLogsList");
    if (auditContainer) {
        auditContainer.innerHTML = allAuditLogs.slice(0, 25).map(l => `
            <div class="stack-card" style="padding:10px 14px;">
                <strong>${escapeHtml(l.actionTitle)}</strong> — <span class="muted-hint">${escapeHtml(l.detailsText)} (${escapeHtml(l.userName)})</span>
            </div>
        `).join("");
    }
}

// لوحة الشرف والأسئلة الشائعة
if ($("openHonorBoardBtn")) {
    $("openHonorBoardBtn").onclick = () => {
        const counts = {};
        allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download").forEach(b => {
            const k = b.addedByUid || b.addedByName || "anon";
            if (!counts[k]) {
                counts[k] = {
                    name: b.addedByName || "باحث",
                    photo: b.addedByPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.addedByName || "م")}&background=142622&color=c4924c`,
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
        $("infoModalTitle").innerHTML = `<i class="ri-question-line"></i> دليل مكتبة وموسوعة الحجرية`;
        $("infoModalBody").innerHTML = `
            <div class="accordion-group">
                <details class="clean-accordion" open>
                    <summary><span>ما هي مكتبة وموسوعة الحجرية؟</span><i class="ri-arrow-down-s-line acc-arrow"></i></summary>
                    <div class="accordion-body">منصة ثقافية غير ربحية يمنية المنشأ عربية الأفق، لتوثيق المؤلفات والكتّاب ودور النشر العربية واليمنية.</div>
                </details>
                <details class="clean-accordion">
                    <summary><span>كيف تعمل روابط الاستشهاد والمشاركة؟</span><i class="ri-arrow-down-s-line acc-arrow"></i></summary>
                    <div class="accordion-body">كل كتاب ومؤلف يمتلك رابطاً مباشراً خاصاً به يفتح صفحة الكتاب فوراً عند النقر عليه.</div>
                </details>
            </div>
        `;
        $("infoModal").style.display = "flex";
    };
}

if ($("closeInfoModal")) $("closeInfoModal").onclick = () => $("infoModal").style.display = "none";

// دعم تثبيت التطبيق (PWA)
let deferredPwaPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    if ($("pwaInstallStatusSub")) {
        $("pwaInstallStatusSub").textContent = "التطبيق جاهز للتثبيت المباشر بضغطة واحدة";
    }
});

if ($("installPwaBtn")) {
    $("installPwaBtn").onclick = async () => {
        if (deferredPwaPrompt) {
            deferredPwaPrompt.prompt();
            await deferredPwaPrompt.userChoice;
            deferredPwaPrompt = null;
        } else {
            alert("لتثبيت التطبيق مباشرة على شاشتك الرئيسية:\n• في كروم (أندرويد): افتح قائمة المتصفح (⋮) واختر «تثبيت التطبيق» أو «الإضافة إلى الشاشة الرئيسية».\n• في سفاري (آيفون): اضغط زر المشاركة ثم اختر «إضافة إلى الصفحة الرئيسية».");
        }
    };
}

// الانطلاق
fetchAllEncyclopediaData();
