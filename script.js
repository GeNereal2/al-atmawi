import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAoxZQ96uziaGETAEWH0BONmgPPUoa-wD8",
  authDomain: "al-atmawi.firebaseapp.com",
  projectId: "al-atmawi",
  storageBucket: "al-atmawi.firebasestorage.app",
  messagingSenderId: "420901103119",
  appId: "1:420901103119:web:608f401260a3f8d532257a",
  measurementId: "G-ZTJ7M3GB8Y"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
try {
  getAnalytics(app);
} catch (error) {
  console.error("Analytics init failed:", error);
}

/* =========================
   Categories
========================= */
const CATEGORIES = [
  { id: "drinks", label: "المشروبات", subtitle: "تشكيلة من ألذ وأبرد المشروبات", icon: "🥤" },
  { id: "chips", label: "الشيبسات", subtitle: "أشهى أنواع الشيبس والسناكس", icon: "🍟" },
  { id: "chocolate", label: "الشوكولاتات", subtitle: "أفخر أنواع الشوكولاتة العالمية", icon: "🍫" },
  { id: "jelly", label: "جلي وجوميات", subtitle: "حلويات جلي وجوميات بأشكال ونكهات متنوعة", icon: "🍬" },
  { id: "marshmallow", label: "المارشميلو", subtitle: "مارشميلو طري بنكهات متنوعة", icon: "☁️" },
  { id: "toffee", label: "التوفي والملبسات", subtitle: "توفي وملبسات وحلويات كلاسيكية", icon: "🍭" },
  { id: "bigla", label: "بيجلا", subtitle: "تشكيلة بيجلا المميزة", icon: "🥨" }
];

const CATEGORY_IDS = CATEGORIES.map(c => c.id);

// أي منتج قديم بدون تصنيف (أو بتصنيف غير معروف) بيظهر هون بدل ما يختفي
const OTHER_CATEGORY = { id: "__other__", label: "أخرى", subtitle: "منتجات بدون تصنيف محدد", icon: "❓" };

const PRODUCTS_PER_CATEGORY_STEP = 8;

let allProducts = []; // كل المنتجات المحمّلة من Firestore
let isLoadingProducts = false;
let revealCounts = {}; // كم منتج ظاهر حاليًا لكل تصنيف

/* =========================
   Price Tiers (فئات الأسعار: جملة / توزيع)
   - الفئة بتنحفظ بحساب الزبون (customers/{uid}.tier) والأدمن بس بيقدر يغيرها
   - حساب private@gmail.com القديم بيضل يشتغل كـ "جملة" تلقائيًا
========================= */
const PRIVATE_VIEWER_EMAIL = "private@gmail.com";

const PRICE_TIERS = {
  wholesale: { label: "الجملة", collection: "privatePricing" },
  distribution: { label: "التوزيع", collection: "distributionPricing" }
};

let currentTier = "";      // "" = زبون عادي | "wholesale" | "distribution"
let tierPricingMap = {};   // productId -> سعر الفئة
let currentCustomerTierFromProfile = "";

const privateBanner = document.getElementById("privateBanner");
const privateBannerText = document.getElementById("privateBannerText");
const privateLogoutBtn = document.getElementById("privateLogoutBtn");

privateLogoutBtn.addEventListener("click", () => signOut(auth));

async function loadTierPricing(tier) {
  const tierInfo = PRICE_TIERS[tier];
  if (!tierInfo) {
    tierPricingMap = {};
    return;
  }
  try {
    const snapshot = await getDocs(collection(db, tierInfo.collection));
    const map = {};
    snapshot.docs.forEach(docSnap => {
      map[docSnap.id] = docSnap.data().price || "";
    });
    tierPricingMap = map;
  } catch (error) {
    console.error(error);
    tierPricingMap = {};
  }
}

function getDisplayPrice(product) {
  if (currentTier && tierPricingMap[product.id]) {
    return tierPricingMap[product.id];
  }
  return product.desc || "";
}

onAuthStateChanged(auth, async (user) => {
  const previousTier = currentTier;

  currentCustomerUser = user || null;

  if (currentCustomerUser) {
    await loadCustomerProfile(currentCustomerUser.uid);
  } else {
    currentCustomerPhone = "";
    currentCustomerRegion = "";
    currentCustomerTierFromProfile = "";
  }

  // تحديد فئة الأسعار
  const isLegacyPrivate = !!(user && user.email && user.email.toLowerCase() === PRIVATE_VIEWER_EMAIL);
  if (isLegacyPrivate) {
    currentTier = "wholesale";
  } else if (user && PRICE_TIERS[currentCustomerTierFromProfile]) {
    currentTier = currentCustomerTierFromProfile;
  } else {
    currentTier = "";
  }

  if (currentTier) {
    await loadTierPricing(currentTier);
    privateBannerText.textContent = `🔒 أنت تشاهد أسعار ${PRICE_TIERS[currentTier].label}`;
    privateBanner.classList.remove("hidden");
  } else {
    tierPricingMap = {};
    privateBanner.classList.add("hidden");
  }

  if (previousTier !== currentTier) renderProducts();

  updateAccountUI();
});

/* =========================
   Customer Account (تسجيل زبون عادي)
========================= */
let currentCustomerUser = null;
let currentCustomerPhone = "";
let currentCustomerRegion = "";

const REGION_LABELS = {
  west_bank: { label: "الضفة الغربية", fee: 17 },
  jerusalem: { label: "القدس", fee: 27 },
  inside: { label: "الداخل", fee: 70 }
};

const accountBtn = document.getElementById("accountBtn");
const accountBtnLabel = document.getElementById("accountBtnLabel");
const accountModal = document.getElementById("accountModal");
const accountModalCloseBtn = document.getElementById("accountModalCloseBtn");

const customerAuthViews = document.getElementById("customerAuthViews");
const customerLoginView = document.getElementById("customerLoginView");
const customerSignupView = document.getElementById("customerSignupView");
const customerAccountView = document.getElementById("customerAccountView");

const customerLoginForm = document.getElementById("customerLoginForm");
const customerLoginEmail = document.getElementById("customerLoginEmail");
const customerLoginPassword = document.getElementById("customerLoginPassword");
const customerLoginError = document.getElementById("customerLoginError");

const customerSignupForm = document.getElementById("customerSignupForm");
const customerSignupName = document.getElementById("customerSignupName");
const customerSignupEmail = document.getElementById("customerSignupEmail");
const customerSignupPhone = document.getElementById("customerSignupPhone");
const customerSignupRegion = document.getElementById("customerSignupRegion");
const customerSignupPassword = document.getElementById("customerSignupPassword");
const customerSignupError = document.getElementById("customerSignupError");

const showSignupBtn = document.getElementById("showSignupBtn");
const showLoginBtn = document.getElementById("showLoginBtn");

const customerAccountName = document.getElementById("customerAccountName");
const customerAccountEmail = document.getElementById("customerAccountEmail");
const customerAccountNameInput = document.getElementById("customerAccountNameInput");
const customerAccountPhone = document.getElementById("customerAccountPhone");
const customerAccountRegion = document.getElementById("customerAccountRegion");
const customerPhoneMessage = document.getElementById("customerPhoneMessage");
const saveCustomerPhoneBtn = document.getElementById("saveCustomerPhoneBtn");
const customerLogoutBtn = document.getElementById("customerLogoutBtn");

function isValidWhatsAppNumber(value) {
  if (!value) return false;
  // نسمح بعلامة + وأرقام بس (نشيل مسافات وشرطات وأقواس قبل الفحص)
  const cleaned = value.trim().replace(/[\s\-()]/g, "");
  return /^\+?\d{7,15}$/.test(cleaned);
}

function translateAuthError(error) {
  const code = error && error.code ? error.code : "";
  const map = {
    "auth/email-already-in-use": "هذا البريد الإلكتروني مسجل مسبقًا، جرب تسجل الدخول بدل ما تعمل حساب جديد",
    "auth/invalid-email": "البريد الإلكتروني غير صحيح",
    "auth/weak-password": "كلمة المرور لازم تكون 6 أحرف على الأقل",
    "auth/wrong-password": "كلمة المرور غير صحيحة",
    "auth/user-not-found": "ما في حساب بهذا البريد الإلكتروني",
    "auth/invalid-credential": "بيانات الدخول غير صحيحة",
    "auth/too-many-requests": "محاولات كثيرة، جرب بعد شوي"
  };
  return map[code] || "حدث خطأ، حاول مرة ثانية";
}

function openAccountModal() {
  accountModal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeAccountModal() {
  accountModal.classList.remove("active");
  document.body.style.overflow = "";
}

function showCustomerLoginView() {
  customerLoginView.classList.remove("hidden");
  customerSignupView.classList.add("hidden");
  customerLoginError.classList.add("hidden");
}

function showCustomerSignupView() {
  customerSignupView.classList.remove("hidden");
  customerLoginView.classList.add("hidden");
  customerSignupError.classList.add("hidden");
}

function updateAccountUI() {
  if (currentCustomerUser) {
    accountBtnLabel.textContent = currentCustomerUser.displayName || "حسابي";
    customerAuthViews.classList.add("hidden");
    customerAccountView.classList.remove("hidden");
    customerAccountName.textContent = currentCustomerUser.displayName || "";
    customerAccountEmail.textContent = currentCustomerUser.email || "";
    customerAccountNameInput.value = currentCustomerUser.displayName || "";
    customerAccountPhone.value = currentCustomerPhone || "";
    customerAccountRegion.value = currentCustomerRegion || "";
    customerPhoneMessage.classList.add("hidden");
  } else {
    accountBtnLabel.textContent = "دخول";
    customerAccountView.classList.add("hidden");
    customerAuthViews.classList.remove("hidden");
    showCustomerLoginView();
  }
}

async function loadCustomerProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "customers", uid));
    const data = snap.exists() ? snap.data() : {};
    currentCustomerPhone = data.phone || "";
    currentCustomerRegion = data.region || "";
    currentCustomerTierFromProfile = data.tier || "";
  } catch (error) {
    console.error(error);
    currentCustomerPhone = "";
    currentCustomerRegion = "";
    currentCustomerTierFromProfile = "";
  }
}

async function saveCustomerProfile(phone, name, region) {
  if (!currentCustomerUser) return;
  await setDoc(doc(db, "customers", currentCustomerUser.uid), {
    name: name || currentCustomerUser.displayName || "",
    email: currentCustomerUser.email || "",
    phone,
    region,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

accountBtn.addEventListener("click", openAccountModal);
accountModalCloseBtn.addEventListener("click", closeAccountModal);
accountModal.addEventListener("click", (e) => {
  if (e.target === accountModal) closeAccountModal();
});
showSignupBtn.addEventListener("click", showCustomerSignupView);
showLoginBtn.addEventListener("click", showCustomerLoginView);

customerLoginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  customerLoginError.classList.add("hidden");

  const email = customerLoginEmail.value.trim();
  const password = customerLoginPassword.value.trim();
  if (!email || !password) return;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    customerLoginForm.reset();
    closeAccountModal();
  } catch (error) {
    console.error(error);
    customerLoginError.textContent = translateAuthError(error);
    customerLoginError.classList.remove("hidden");
  }
});

customerSignupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  customerSignupError.classList.add("hidden");

  const name = customerSignupName.value.trim();
  const email = customerSignupEmail.value.trim();
  const phone = customerSignupPhone.value.trim();
  const region = customerSignupRegion.value;
  const password = customerSignupPassword.value.trim();

  if (!name || !email || !phone || !region || !password) {
    customerSignupError.textContent = "المرجو تعبئة كل الحقول قبل إنشاء الحساب";
    customerSignupError.classList.remove("hidden");
    return;
  }

  if (!isValidWhatsAppNumber(phone)) {
    customerSignupError.textContent = "لازم تحط رقم الواتساب الفعلي (أرقام بس)، مش يوزر نيم أو أي نص ثاني";
    customerSignupError.classList.remove("hidden");
    return;
  }

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });
    await setDoc(doc(db, "customers", credential.user.uid), {
      name,
      email,
      phone,
      region,
      createdAt: serverTimestamp()
    });
    currentCustomerUser = credential.user;
    currentCustomerPhone = phone;
    currentCustomerRegion = region;
    updateAccountUI();
    customerSignupForm.reset();
    closeAccountModal();
  } catch (error) {
    console.error(error);
    customerSignupError.textContent = translateAuthError(error);
    customerSignupError.classList.remove("hidden");
  }
});

customerLogoutBtn.addEventListener("click", () => signOut(auth));

/* =========================
   My Orders (طلباتي السابقة + تعديل/إلغاء الطلب)
========================= */
const EDITABLE_STATUS = "جديد"; // التعديل والإلغاء متاحين بس لما تكون حالة الطلب لسا "جديد"

const ORDER_STATUS_LABELS = {
  "جديد": "🆕 جديد",
  "تم التواصل": "📞 تم التواصل",
  "مكتمل": "✅ مكتمل"
};

const viewMyOrdersBtn = document.getElementById("viewMyOrdersBtn");
const myOrdersModal = document.getElementById("myOrdersModal");
const myOrdersCloseBtn = document.getElementById("myOrdersCloseBtn");
const myOrdersList = document.getElementById("myOrdersList");
const myOrdersEmpty = document.getElementById("myOrdersEmpty");

const editOrderModal = document.getElementById("editOrderModal");
const editOrderCloseBtn = document.getElementById("editOrderCloseBtn");
const editOrderItemsList = document.getElementById("editOrderItemsList");
const editOrderEmpty = document.getElementById("editOrderEmpty");
const editOrderSubtotalRow = document.getElementById("editOrderSubtotalRow");
const editOrderSubtotalAmount = document.getElementById("editOrderSubtotalAmount");
const editOrderMessage = document.getElementById("editOrderMessage");
const saveEditOrderBtn = document.getElementById("saveEditOrderBtn");
const cancelOrderBtn = document.getElementById("cancelOrderBtn");
const editOrderAddProductsBtn = document.getElementById("editOrderAddProductsBtn");
const editOrderBanner = document.getElementById("editOrderBanner");
const editOrderBannerText = document.getElementById("editOrderBannerText");
const backToEditOrderBtn = document.getElementById("backToEditOrderBtn");
let isAddingToOrder = false; // لما يكون true، زر "أضف للسلة" بيضيف للطلب يلي عم يتعدل بدل السلة

let myOrdersCache = [];
let editingOrderId = null;
let editingOrderItems = [];

function formatOrderDate(timestamp) {
  if (!timestamp) return "";
  try {
    const dateObj = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
    return dateObj.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

async function loadMyOrders() {
  if (!currentCustomerUser) return;

  myOrdersList.innerHTML = `<div class="empty-message">جاري التحميل...</div>`;
  myOrdersEmpty.classList.add("hidden");

  try {
    const ordersQuery = query(collection(db, "orders"), where("customerUid", "==", currentCustomerUser.uid));
    const snapshot = await getDocs(ordersQuery);

    myOrdersCache = snapshot.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => {
        const aTime = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        const bTime = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return bTime - aTime;
      });

    renderMyOrders();
  } catch (error) {
    console.error(error);
    myOrdersList.innerHTML = `<div class="empty-message">حدث خطأ أثناء تحميل طلباتك</div>`;
  }
}

function renderMyOrders() {
  if (!myOrdersCache.length) {
    myOrdersList.innerHTML = "";
    myOrdersEmpty.classList.remove("hidden");
    return;
  }

  myOrdersEmpty.classList.add("hidden");

  myOrdersList.innerHTML = myOrdersCache.map(order => {
    const isEditable = order.status === EDITABLE_STATUS;
    return `
      <div class="order-history-item">
        <div class="order-history-head">
          <span class="order-history-date">${escapeHtml(formatOrderDate(order.createdAt))}</span>
          <span class="order-history-status">${escapeHtml(ORDER_STATUS_LABELS[order.status] || order.status || "")}</span>
        </div>
        <ul class="order-items-list">
          ${(order.items || []).map(item => `
            <li>${escapeHtml(item.name || "")} × ${escapeHtml(String(item.qty || 1))}${item.price ? ` — ${escapeHtml(item.price)}` : ""}</li>
          `).join("")}
          ${order.total ? `<li class="order-total-line">المبلغ المطلوب ( غير شامل التوصيل ): ${escapeHtml(String(order.total))}</li>` : ""}
          ${order.deliveryFee ? `<li>سعر التوصيل: ${escapeHtml(String(order.deliveryFee))}</li>` : ""}
        </ul>
        ${isEditable
          ? `<button type="button" class="btn btn-outline full-btn" data-edit-order="${order.id}">✏️ تعديل / إلغاء الطلب</button>`
          : `<p class="admin-note" style="margin-top:6px">التعديل غير متاح — الطلب قيد المعالجة أو مكتمل بالفعل.</p>`}
      </div>
    `;
  }).join("");

  myOrdersList.querySelectorAll("[data-edit-order]").forEach(btn => {
    btn.addEventListener("click", () => openEditOrderModal(btn.dataset.editOrder));
  });
}

function openMyOrdersModal() {
  loadMyOrders();
  myOrdersModal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeMyOrdersModal() {
  myOrdersModal.classList.remove("active");
  document.body.style.overflow = "";
}

viewMyOrdersBtn.addEventListener("click", openMyOrdersModal);
myOrdersCloseBtn.addEventListener("click", closeMyOrdersModal);
myOrdersModal.addEventListener("click", (e) => {
  if (e.target === myOrdersModal) closeMyOrdersModal();
});

/* ===== تعديل / إلغاء طلب ===== */
function openEditOrderModal(orderId) {
  const order = myOrdersCache.find(o => o.id === orderId);
  if (!order || order.status !== EDITABLE_STATUS) return;

  editingOrderId = orderId;
  editingOrderItems = (order.items || []).map(item => ({ ...item }));
  editOrderMessage.classList.add("hidden");

  renderEditOrderItems();
  editOrderModal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeEditOrderModal() {
  editOrderModal.classList.remove("active");
  document.body.style.overflow = "";
  editingOrderId = null;
  editingOrderItems = [];
  stopAddingToOrder();
}

function renderEditOrderItems() {
  if (!editingOrderItems.length) {
    editOrderItemsList.innerHTML = "";
    editOrderEmpty.classList.remove("hidden");
    editOrderSubtotalRow.classList.add("hidden");
    saveEditOrderBtn.disabled = true;
    return;
  }

  editOrderEmpty.classList.add("hidden");
  saveEditOrderBtn.disabled = false;

  const subtotal = editingOrderItems.reduce((sum, item) => sum + (extractPriceNumber(item.price) * item.qty), 0);
  if (subtotal > 0) {
    editOrderSubtotalAmount.textContent = subtotal.toLocaleString("ar-EG");
    editOrderSubtotalRow.classList.remove("hidden");
  } else {
    editOrderSubtotalRow.classList.add("hidden");
  }

  editOrderItemsList.innerHTML = editingOrderItems.map((item, index) => `
    <div class="cart-item" data-edit-item-index="${index}">
      <div class="cart-item-info">
        <h4>${escapeHtml(item.name || "")}</h4>
        ${item.price ? `<p>${escapeHtml(item.price)}</p>` : ""}
      </div>
      <div class="cart-item-qty">
        <button type="button" data-edit-qty-decrease="${index}">−</button>
        <span>${item.qty}</span>
        <button type="button" data-edit-qty-increase="${index}">+</button>
      </div>
      <button type="button" class="cart-item-remove" data-edit-remove="${index}">🗑️</button>
    </div>
  `).join("");

  editOrderItemsList.querySelectorAll("[data-edit-qty-decrease]").forEach(btn => {
    btn.addEventListener("click", () => changeEditQty(parseInt(btn.dataset.editQtyDecrease, 10), -1));
  });
  editOrderItemsList.querySelectorAll("[data-edit-qty-increase]").forEach(btn => {
    btn.addEventListener("click", () => changeEditQty(parseInt(btn.dataset.editQtyIncrease, 10), 1));
  });
  editOrderItemsList.querySelectorAll("[data-edit-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      editingOrderItems.splice(parseInt(btn.dataset.editRemove, 10), 1);
      renderEditOrderItems();
    });
  });
}

function changeEditQty(index, delta) {
  const item = editingOrderItems[index];
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    editingOrderItems.splice(index, 1);
  }
  renderEditOrderItems();
}

/* ===== إضافة منتجات جديدة لطلب موجود (من قائمة المنتجات نفسها) ===== */
function getEditingItemsCount() {
  return editingOrderItems.reduce((sum, item) => sum + item.qty, 0);
}

function updateEditOrderBanner() {
  editOrderBannerText.textContent = `✏️ انت قاعد بتضيف منتجات لطلبك— بالطلب هسا ${getEditingItemsCount()} قطعة`;
}

function startAddingToOrder() {
  if (!editingOrderId) return;
  isAddingToOrder = true;

  // نسكّر النوافذ ونرجع الزبون لقائمة المنتجات
  editOrderModal.classList.remove("active");
  myOrdersModal.classList.remove("active");
  accountModal.classList.remove("active");
  document.body.style.overflow = "";

  updateEditOrderBanner();
  editOrderBanner.classList.remove("hidden");
  document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
}

function stopAddingToOrder() {
  isAddingToOrder = false;
  editOrderBanner.classList.add("hidden");
}

function returnToEditOrder() {
  stopAddingToOrder();
  if (!editingOrderId) return;
  renderEditOrderItems();
  editOrderModal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function addProductToEditingOrder(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product || product.isAvailable === false) return;

  const existing = editingOrderItems.find(item => item.productId === productId);
  if (existing) {
    existing.qty += 1;
  } else {
    editingOrderItems.push({
      productId: product.id,
      name: product.name || "",
      qty: 1,
      price: getDisplayPrice(product) || ""
    });
  }

  updateEditOrderBanner();
  if (typeof window.showToast === "function") window.showToast(`✅ تمت إضافة "${product.name}" لطلبك`);
}

editOrderAddProductsBtn.addEventListener("click", startAddingToOrder);
backToEditOrderBtn.addEventListener("click", returnToEditOrder);

editOrderCloseBtn.addEventListener("click", closeEditOrderModal);
editOrderModal.addEventListener("click", (e) => {
  if (e.target === editOrderModal) closeEditOrderModal();
});

saveEditOrderBtn.addEventListener("click", async () => {
  editOrderMessage.classList.add("hidden");
  if (!editingOrderId || !editingOrderItems.length) return;

  saveEditOrderBtn.disabled = true;
  saveEditOrderBtn.textContent = "جاري الحفظ...";

  try {
    const newTotal = editingOrderItems.reduce((sum, item) => sum + (extractPriceNumber(item.price) * item.qty), 0);
    await updateDoc(doc(db, "orders", editingOrderId), {
      items: editingOrderItems,
      total: newTotal,
      updatedAt: serverTimestamp()
    });
    closeEditOrderModal();
    if (typeof window.showToast === "function") window.showToast("✅ تم تعديل الطلب بنجاح");
    await loadMyOrders();
  } catch (error) {
    console.error(error);
    editOrderMessage.textContent = "حدث خطأ أثناء حفظ التعديل، حاول مرة ثانية";
    editOrderMessage.classList.remove("hidden");
  } finally {
    saveEditOrderBtn.disabled = false;
    saveEditOrderBtn.textContent = "حفظ التعديلات";
  }
});

cancelOrderBtn.addEventListener("click", async () => {
  if (!editingOrderId) return;
  const confirmed = window.confirm("متأكد إنك بدك تلغي هذا الطلب بالكامل؟ ما بيرجع بعد الإلغاء.");
  if (!confirmed) return;

  cancelOrderBtn.disabled = true;
  try {
    await deleteDoc(doc(db, "orders", editingOrderId));
    closeEditOrderModal();
    if (typeof window.showToast === "function") window.showToast("✅ تم إلغاء الطلب");
    await loadMyOrders();
  } catch (error) {
    console.error(error);
    editOrderMessage.textContent = "حدث خطأ أثناء إلغاء الطلب، حاول مرة ثانية";
    editOrderMessage.classList.remove("hidden");
  } finally {
    cancelOrderBtn.disabled = false;
  }
});

saveCustomerPhoneBtn.addEventListener("click", async () => {
  customerPhoneMessage.classList.add("hidden");
  const name = customerAccountNameInput.value.trim();
  const phone = customerAccountPhone.value.trim();
  const region = customerAccountRegion.value;

  if (!name || !phone || !region) {
    customerPhoneMessage.textContent = "اكتب اسمك ورقم الواتساب واختر منطقتك أولاً";
    customerPhoneMessage.classList.remove("hidden");
    return;
  }

  if (!isValidWhatsAppNumber(phone)) {
    customerPhoneMessage.textContent = "لازم تحط رقم الواتساب الفعلي (أرقام بس)، مش يوزر نيم أو أي نص ثاني";
    customerPhoneMessage.classList.remove("hidden");
    return;
  }

  saveCustomerPhoneBtn.disabled = true;
  saveCustomerPhoneBtn.textContent = "جاري الحفظ...";

  try {
    if (currentCustomerUser.displayName !== name) {
      await updateProfile(currentCustomerUser, { displayName: name });
    }
    await saveCustomerProfile(phone, name, region);
    currentCustomerPhone = phone;
    currentCustomerRegion = region;
    customerAccountName.textContent = name;
    accountBtnLabel.textContent = name;
    if (typeof window.showToast === "function") window.showToast("✅ تم حفظ بياناتك");
  } catch (error) {
    console.error(error);
    customerPhoneMessage.textContent = "حدث خطأ أثناء حفظ البيانات";
    customerPhoneMessage.classList.remove("hidden");
  } finally {
    saveCustomerPhoneBtn.disabled = false;
    saveCustomerPhoneBtn.textContent = "حفظ البيانات";
  }
});

/* =========================
   Shopping Cart (سلة المشتريات)
========================= */
const CART_STORAGE_KEY = "al-atmawi-cart";

let cart = loadCart();

const cartBtn = document.getElementById("cartBtn");
const cartCount = document.getElementById("cartCount");
const cartModal = document.getElementById("cartModal");
const cartModalCloseBtn = document.getElementById("cartModalCloseBtn");
const cartItemsList = document.getElementById("cartItemsList");
const cartEmptyMessage = document.getElementById("cartEmptyMessage");
const cartSubtotalRow = document.getElementById("cartSubtotalRow");
const cartSubtotalAmount = document.getElementById("cartSubtotalAmount");
const cartDeliveryRow = document.getElementById("cartDeliveryRow");
const cartDeliveryLabel = document.getElementById("cartDeliveryLabel");
const cartDeliveryAmount = document.getElementById("cartDeliveryAmount");
const cartParcelNote = document.getElementById("cartParcelNote");
const submitOrderBtn = document.getElementById("submitOrderBtn");
const cartMessage = document.getElementById("cartMessage");

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // تجاهل أخطاء تجاوز المساحة المسموحة
  }
}

function getCartCount() {
  return cart.reduce((sum, item) => sum + item.qty, 0);
}

function extractPriceNumber(priceText) {
  if (!priceText) return 0;
  // بياخد آخر رقم موجود بالنص (عشان لو كتب "بدل 20 صار 15" ياخد السعر الفعلي 15)
  const matches = String(priceText).match(/\d+(\.\d+)?/g);
  if (!matches || !matches.length) return 0;
  return parseFloat(matches[matches.length - 1]) || 0;
}

function calculateCartTotal() {
  return cart.reduce((sum, item) => sum + (extractPriceNumber(item.price) * item.qty), 0);
}

function getDeliveryFee() {
  const info = REGION_LABELS[currentCustomerRegion];
  return info ? info.fee : 0;
}

function getRegionLabel() {
  const info = REGION_LABELS[currentCustomerRegion];
  return info ? info.label : "";
}

function updateCartBadge() {
  const count = getCartCount();
  if (count > 0) {
    cartCount.textContent = count;
    cartCount.classList.remove("hidden");
  } else {
    cartCount.classList.add("hidden");
  }
}

function addToCart(product) {
  if (product.isAvailable === false) {
    if (typeof window.showToast === "function") window.showToast("❌ هذا المنتج غير متوفر حاليًا");
    return;
  }

  // لو الزبون عم يضيف منتجات لطلب سابق، المنتج بيروح للطلب مش للسلة
  if (isAddingToOrder && editingOrderId) {
    addProductToEditingOrder(product.id);
    return;
  }

  if (!currentCustomerUser) {
    openAccountModal();
    return;
  }

  const existing = cart.find(item => item.productId === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      image: product.image || "",
      price: getDisplayPrice(product),
      qty: 1
    });
  }
  saveCart();
  updateCartBadge();
  if (typeof window.showToast === "function") window.showToast("✅ تمت الإضافة للسلة");
}

function changeCartQty(productId, delta) {
  const item = cart.find(i => i.productId === productId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(i => i.productId !== productId);
  }
  saveCart();
  renderCart();
  updateCartBadge();
}

function removeFromCart(productId) {
  cart = cart.filter(i => i.productId !== productId);
  saveCart();
  renderCart();
  updateCartBadge();
}

function renderCart() {
  if (!cart.length) {
    cartItemsList.innerHTML = "";
    cartEmptyMessage.classList.remove("hidden");
    cartSubtotalRow.classList.add("hidden");
    cartDeliveryRow.classList.add("hidden");
    cartParcelNote.classList.add("hidden");
    submitOrderBtn.classList.add("hidden");
    return;
  }

  cartEmptyMessage.classList.add("hidden");
  submitOrderBtn.classList.remove("hidden");

  const subtotal = calculateCartTotal();
  const deliveryFee = getDeliveryFee();

  if (subtotal > 0) {
    cartSubtotalAmount.textContent = subtotal.toLocaleString("ar-EG");
    cartSubtotalRow.classList.remove("hidden");
  } else {
    cartSubtotalRow.classList.add("hidden");
  }

  if (currentCustomerRegion && deliveryFee > 0) {
    cartDeliveryLabel.textContent = `سعر التوصيل (${getRegionLabel()})`;
    cartDeliveryAmount.textContent = deliveryFee.toLocaleString("ar-EG");
    cartDeliveryRow.classList.remove("hidden");
    cartParcelNote.classList.remove("hidden");
  } else {
    cartDeliveryRow.classList.add("hidden");
    cartParcelNote.classList.add("hidden");
  }

  cartItemsList.innerHTML = cart.map(item => `
    <div class="cart-item" data-cart-product-id="${item.productId}">
      <div class="cart-item-image">
        <img src="${escapeHtml(optimizeImageUrl(item.image))}" alt="${escapeHtml(item.name)}" loading="lazy" />
      </div>
      <div class="cart-item-info">
        <h4>${escapeHtml(item.name)}</h4>
        ${item.price ? `<p>${escapeHtml(item.price)}</p>` : ""}
      </div>
      <div class="cart-item-qty">
        <button type="button" data-qty-decrease="${item.productId}">−</button>
        <span>${item.qty}</span>
        <button type="button" data-qty-increase="${item.productId}">+</button>
      </div>
      <button type="button" class="cart-item-remove" data-cart-remove="${item.productId}">🗑️</button>
    </div>
  `).join("");

  cartItemsList.querySelectorAll("[data-qty-decrease]").forEach(btn => {
    btn.addEventListener("click", () => changeCartQty(btn.dataset.qtyDecrease, -1));
  });
  cartItemsList.querySelectorAll("[data-qty-increase]").forEach(btn => {
    btn.addEventListener("click", () => changeCartQty(btn.dataset.qtyIncrease, 1));
  });
  cartItemsList.querySelectorAll("[data-cart-remove]").forEach(btn => {
    btn.addEventListener("click", () => removeFromCart(btn.dataset.cartRemove));
  });
}

function openCartModal() {
  renderCart();
  cartMessage.classList.add("hidden");
  cartModal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeCartModal() {
  cartModal.classList.remove("active");
  document.body.style.overflow = "";
}

cartBtn.addEventListener("click", openCartModal);
cartModalCloseBtn.addEventListener("click", closeCartModal);
cartModal.addEventListener("click", (e) => {
  if (e.target === cartModal) closeCartModal();
});

submitOrderBtn.addEventListener("click", async () => {
  cartMessage.classList.add("hidden");

  if (!currentCustomerUser) {
    openAccountModal();
    return;
  }
  if (!cart.length) return;

  if (!currentCustomerPhone || !currentCustomerRegion) {
    cartMessage.textContent = "لازم تضيف رقم الواتساب وتختار منطقتك من صفحة حسابك قبل ما ترسل الطلب";
    cartMessage.classList.remove("hidden");
    openAccountModal();
    return;
  }

  submitOrderBtn.disabled = true;
  submitOrderBtn.textContent = "جاري الإرسال...";

  try {
    const subtotal = calculateCartTotal();
    const deliveryFee = getDeliveryFee();

    await addDoc(collection(db, "orders"), {
      customerName: currentCustomerUser.displayName || "بدون اسم",
      customerEmail: currentCustomerUser.email || "",
      customerPhone: currentCustomerPhone,
      customerUid: currentCustomerUser.uid,
      customerTier: currentTier || "",
      region: currentCustomerRegion,
      regionLabel: getRegionLabel(),
      items: cart.map(item => ({
        productId: item.productId,
        name: item.name,
        qty: item.qty,
        price: item.price || ""
      })),
      total: subtotal,
      deliveryFee,
      status: "جديد",
      createdAt: serverTimestamp()
    });

    cart = [];
    saveCart();
    renderCart();
    updateCartBadge();
    closeCartModal();
    if (typeof window.showToast === "function") window.showToast("✅ تم إرسال طلبك بنجاح، رح نتواصل معك قريبًا");
  } catch (error) {
    console.error(error);
    cartMessage.textContent = "حدث خطأ أثناء إرسال الطلب، حاول مرة ثانية";
    cartMessage.classList.remove("hidden");
  } finally {
    submitOrderBtn.disabled = false;
    submitOrderBtn.textContent = "إرسال الطلب";
  }
});

updateCartBadge();
const PRODUCTS_CACHE_MAX_AGE = 2 * 60 * 1000; // دقيقتين

const productModal = document.getElementById("productModal");
const modalImg = document.getElementById("modalImg");
const modalName = document.getElementById("modalName");
const modalDesc = document.getElementById("modalDesc");
const modalBadge = document.getElementById("modalBadge");
const modalCloseBtn = document.getElementById("modalCloseBtn");

function openModal(product) {
  modalImg.src = optimizeImageUrl(product.image || "");
  modalImg.alt = product.name || "";
  modalName.textContent = product.name || "";
  modalBadge.textContent = product.isOffer ? "🔥 عرض خاص" : "";
  const displayPrice = getDisplayPrice(product);
  if (displayPrice) {
    modalDesc.textContent = "السعر: " + displayPrice;
    modalDesc.style.display = "block";
  } else {
    modalDesc.style.display = "none";
  }
  productModal.classList.add("active");
  document.body.style.overflow = "hidden";

  const url = new URL(location.href);
  url.searchParams.set("product", product.id);
  history.replaceState(null, "", url.toString());
}

function closeModal() {
  productModal.classList.remove("active");
  document.body.style.overflow = "";

  const url = new URL(location.href);
  url.searchParams.delete("product");
  history.replaceState(null, "", url.toString());
}

modalCloseBtn.addEventListener("click", closeModal);
productModal.addEventListener("click", (e) => {
  if (e.target === productModal) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

const productsCategories = document.getElementById("productsCategories");
const offersSection = document.getElementById("offers");
const offersGrid = document.getElementById("offersGrid");

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

/* ===== تحسين صور Cloudinary تلقائيًا (ضغط + تنسيق أخف) =====
   بيضيف f_auto,q_auto لأي رابط Cloudinary عشان يقلل حجم الصورة
   ويسرّع تحميل الصفحة، بدون ما يأثر على روابط الصور العادية. */
function optimizeImageUrl(url) {
  if (!url) return url;
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
  if (url.includes("f_auto") || url.includes("q_auto")) return url;
  return url.replace("/upload/", "/upload/f_auto,q_auto,w_600/");
}

/* ===== Instant-paint cache (sessionStorage) =====
   يخزن المنتجات مؤقتًا عشان تظهر فورًا عند التنقل
   بينما يتم تحديثها بالخلفية من Firestore. */
function readProductsCache() {
  try {
    const raw = sessionStorage.getItem(PRODUCTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    if (Date.now() - parsed.timestamp > PRODUCTS_CACHE_MAX_AGE) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

function writeProductsCache(items) {
  try {
    sessionStorage.setItem(
      PRODUCTS_CACHE_KEY,
      JSON.stringify({ items, timestamp: Date.now() })
    );
  } catch {
    // تجاهل أخطاء تجاوز المساحة المسموحة
  }
}

/* ===== Skeleton Loaders ===== */
function getProductSkeletons(count = 4) {
  return Array.from({ length: count }, () => `
    <div class="product-card skeleton-card">
      <div class="skeleton-product-image"></div>
      <div class="skeleton-body">
        <div class="skeleton-line skeleton-badge"></div>
        <div class="skeleton-line skeleton-title"></div>
        <div class="skeleton-line skeleton-desc"></div>
      </div>
    </div>
  `).join("");
}

/* ===== Animate cards on appear ===== */
function animateCards(container) {
  const cards = container.querySelectorAll(".product-card:not(.skeleton-card)");
  cards.forEach((card, i) => {
    card.style.opacity = "0";
    card.style.transform = "translateY(20px)";
    card.style.transition = "opacity 0.4s ease, transform 0.4s ease";
    card.style.transitionDelay = `${i * 60}ms`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.style.opacity = "1";
        card.style.transform = "translateY(0)";
      });
    });
  });
}

function getProductsByCategory(categoryId) {
  if (categoryId === OTHER_CATEGORY.id) {
    return allProducts.filter(p => !p.isOffer && !CATEGORY_IDS.includes(p.category));
  }
  return allProducts.filter(p => !p.isOffer && p.category === categoryId);
}

function getOfferProducts() {
  return allProducts.filter(p => p.isOffer);
}

function renderOfferCard(product) {
  const displayPrice = getDisplayPrice(product);
  const isAvailable = product.isAvailable !== false;
  return `
    <div class="product-card offer-card product-card-clickable" data-product-id="${product.id}">
      <div class="offer-ribbon">🔥 عرض خاص</div>
      ${!isAvailable ? `<div class="unavailable-overlay">❌ غير متوفر حاليًا</div>` : ""}
      <div class="product-image">
        <img
          src="${escapeHtml(optimizeImageUrl(product.image || ""))}"
          alt="${escapeHtml(product.name)}"
          loading="lazy"
          decoding="async"
        >
      </div>
      <div class="product-content">
        <h4>${escapeHtml(product.name)}</h4>
        ${displayPrice ? `<p>السعر: ${escapeHtml(displayPrice)}</p>` : ""}
        ${isAvailable
          ? `<button type="button" class="add-to-cart-btn" data-add-to-cart="${product.id}">أضف للسلة 🛒</button>`
          : `<button type="button" class="add-to-cart-btn" disabled>غير متوفر حاليًا</button>`}
      </div>
    </div>
  `;
}

function renderOffers() {
  const offers = getOfferProducts();

  if (!offers.length && !isLoadingProducts) {
    offersSection.classList.add("hidden");
    offersGrid.innerHTML = "";
    return;
  }

  offersSection.classList.remove("hidden");

  offersGrid.innerHTML = !offers.length && isLoadingProducts
    ? getProductSkeletons(4)
    : offers.map(renderOfferCard).join("");

  animateCards(offersSection);

  offersGrid.querySelectorAll(".product-card-clickable").forEach(card => {
    card.addEventListener("click", () => {
      const productId = card.dataset.productId;
      const product = allProducts.find(p => p.id === productId);
      if (!product) return;
      openModal(product);
    });
  });

  offersGrid.querySelectorAll("[data-add-to-cart]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const product = allProducts.find(p => p.id === btn.dataset.addToCart);
      if (product) addToCart(product);
    });
  });
}

function renderProductCard(product) {
  const displayPrice = getDisplayPrice(product);
  const isAvailable = product.isAvailable !== false;
  return `
    <div class="product-card product-card-clickable" data-product-id="${product.id}">
      ${!isAvailable ? `<div class="unavailable-overlay">❌ غير متوفر حاليًا</div>` : ""}
      <div class="product-image">
        <img
          src="${escapeHtml(optimizeImageUrl(product.image || ""))}"
          alt="${escapeHtml(product.name)}"
          loading="lazy"
          decoding="async"
        >
      </div>
      <div class="product-content">
        <h4>${escapeHtml(product.name)}</h4>
        ${displayPrice ? `<p>السعر: ${escapeHtml(displayPrice)}</p>` : ""}
        ${isAvailable
          ? `<button type="button" class="add-to-cart-btn" data-add-to-cart="${product.id}">أضف للسلة 🛒</button>`
          : `<button type="button" class="add-to-cart-btn" disabled>غير متوفر حاليًا</button>`}
      </div>
    </div>
  `;
}

function renderCategorySection(category) {
  const items = getProductsByCategory(category.id);

  if (!items.length && !isLoadingProducts) return "";

  const revealed = revealCounts[category.id] || PRODUCTS_PER_CATEGORY_STEP;
  const visibleItems = items.slice(0, revealed);
  const hasMore = items.length > revealed;

  const gridHtml = !items.length && isLoadingProducts
    ? getProductSkeletons(4)
    : visibleItems.map(renderProductCard).join("");

  return `
    <div class="category-block" data-category="${category.id}">
      <div class="category-header">
        <h3><span class="category-icon">${category.icon}</span> ${escapeHtml(category.label)}</h3>
        <p>${escapeHtml(category.subtitle)}</p>
      </div>
      <div class="products-grid" data-category-grid="${category.id}">
        ${gridHtml}
      </div>
      ${hasMore ? `
        <div class="load-more-wrap">
          <button class="btn btn-outline category-load-more" data-category-more="${category.id}" type="button">
            عرض المزيد
          </button>
        </div>
      ` : ""}
    </div>
  `;
}

function renderProducts() {
  renderOffers();

  const hasOtherItems = getProductsByCategory(OTHER_CATEGORY.id).length > 0;
  const allSections = hasOtherItems ? [...CATEGORIES, OTHER_CATEGORY] : CATEGORIES;

  if (!allProducts.length && isLoadingProducts) {
    productsCategories.innerHTML = CATEGORIES.map(cat => `
      <div class="category-block" data-category="${cat.id}">
        <div class="category-header">
          <h3><span class="category-icon">${cat.icon}</span> ${escapeHtml(cat.label)}</h3>
          <p>${escapeHtml(cat.subtitle)}</p>
        </div>
        <div class="products-grid">${getProductSkeletons(4)}</div>
      </div>
    `).join("");
    return;
  }

  const sectionsHtml = allSections.map(renderCategorySection).filter(Boolean).join("");

  if (!sectionsHtml) {
    productsCategories.innerHTML = `<div class="empty-message">لا توجد منتجات حاليًا</div>`;
    return;
  }

  productsCategories.innerHTML = sectionsHtml;

  productsCategories.querySelectorAll(".category-block").forEach(block => {
    animateCards(block);
  });

  productsCategories.querySelectorAll(".product-card-clickable").forEach(card => {
    card.addEventListener("click", () => {
      const productId = card.dataset.productId;
      const product = allProducts.find(p => p.id === productId);
      if (!product) return;
      openModal(product);
    });
  });

  productsCategories.querySelectorAll("[data-add-to-cart]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const product = allProducts.find(p => p.id === btn.dataset.addToCart);
      if (product) addToCart(product);
    });
  });

  productsCategories.querySelectorAll("[data-category-more]").forEach(btn => {
    btn.addEventListener("click", () => {
      const categoryId = btn.dataset.categoryMore;
      revealCounts[categoryId] = (revealCounts[categoryId] || PRODUCTS_PER_CATEGORY_STEP) + PRODUCTS_PER_CATEGORY_STEP;
      renderProducts();
    });
  });
}

async function loadInitialProducts() {
  isLoadingProducts = true;
  revealCounts = {};

  // رسم فوري من الكاش (إن وجد) بينما نجيب البيانات الحقيقية بالخلفية
  const cached = readProductsCache();
  allProducts = cached && cached.length ? cached : [];
  renderProducts();

  try {
    const productsQuery = query(
      collection(db, "products"),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(productsQuery);

    const loadedProducts = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    allProducts = loadedProducts;
    writeProductsCache(loadedProducts);
  } catch (error) {
    console.error(error);
    if (!allProducts.length) {
      productsCategories.innerHTML = `<div class="empty-message">حدث خطأ أثناء تحميل المنتجات</div>`;
    }
  } finally {
    isLoadingProducts = false;
    renderProducts();
  }
}

async function checkDeepLink() {
  const params = new URLSearchParams(location.search);
  const productId = params.get("product");
  if (!productId) return;

  try {
    const productRef = doc(db, "products", productId);
    const productSnap = await getDoc(productRef);
    if (!productSnap.exists()) return;

    const product = { id: productSnap.id, ...productSnap.data() };
    openModal(product);

    document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error("Deep link error:", err);
  }
}

async function init() {
  await loadInitialProducts();
  await checkDeepLink();
}

init();
