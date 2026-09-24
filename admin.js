import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  query,
  orderBy,
  serverTimestamp,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* =========================
   Firebase Config
========================= */
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

/* =========================
   Roles
========================= */
const OWNER_ADMIN = "alimohey586@gmail.com";
const ADMIN_PRODUCTS_PAGE_SIZE = 8;

function getUserRole(user) {
  if (!user || !user.email) return null;

  const email = user.email.toLowerCase();

  if (email === OWNER_ADMIN) return "owner";

  return null;
}

function isOwner(user) {
  return getUserRole(user) === "owner";
}

function isAllowedAdmin(user) {
  return isOwner(user);
}

/* =========================
   State
========================= */
let products = [];

let allFilteredProducts = [];
let adminProductsCursor = 0;
let adminProductsHasMore = false;
let adminProductsLoading = false;
let productSearchTerm = "";

/* Orders */
let allOrders = [];
let ordersLoading = false;
let orderSearchTerm = "";

/* Auth */
const loginBox = document.getElementById("loginBox");
const dashboardBox = document.getElementById("dashboardBox");
const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const logoutBtn = document.getElementById("logoutBtn");
const exportDataBtn = document.getElementById("exportDataBtn");
const adminDisplayName = document.getElementById("adminDisplayName");
const adminRoleLabel = document.getElementById("adminRoleLabel");

/* Product */
const productFormCard = document.getElementById("productFormCard");
const productForm = document.getElementById("productForm");
const productIdInput = document.getElementById("productId");
const productNameInput = document.getElementById("productName");
const productDescInput = document.getElementById("productDesc");
const productPrivatePriceInput = document.getElementById("productPrivatePrice");
const productDistributionPriceInput = document.getElementById("productDistributionPrice");
const productListingTypeInput = document.getElementById("productListingType");
const productAvailabilityInput = document.getElementById("productAvailability");
const productCategoryInput = document.getElementById("productCategory");
const productImageInput = document.getElementById("productImage");
const productImageFileInput = document.getElementById("productImageFile");
const productImageDataInput = document.getElementById("productImageData");
const productPreview = document.getElementById("productPreview");
const productFormTitle = document.getElementById("productFormTitle");
const productSubmitBtn = document.getElementById("productSubmitBtn");
const cancelProductEditBtn = document.getElementById("cancelProductEditBtn");
const adminProductsList = document.getElementById("adminProductsList");
const adminProductsSearchInput = document.getElementById("adminProductsSearch");

/* Orders */
const adminOrdersList = document.getElementById("adminOrdersList");
const adminOrdersSearchInput = document.getElementById("adminOrdersSearch");
const refreshOrdersBtn = document.getElementById("refreshOrdersBtn");
const ordersCountBadge = document.getElementById("ordersCountBadge");

/* =========================
   Confirm Modal
========================= */
function showConfirmModal(title, msg) {
  return new Promise(resolve => {
    const overlay   = document.getElementById("confirmModal");
    const titleEl   = document.getElementById("confirmModalTitle");
    const msgEl     = document.getElementById("confirmModalMsg");
    const cancelBtn = document.getElementById("confirmModalCancel");
    const okBtn     = document.getElementById("confirmModalOk");

    titleEl.textContent = title;
    msgEl.textContent   = msg;
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";

    function close(result) {
      overlay.classList.remove("active");
      document.body.style.overflow = "";
      cancelBtn.removeEventListener("click", onCancel);
      okBtn.removeEventListener("click", onOk);
      overlay.removeEventListener("click", onOverlay);
      resolve(result);
    }

    function onCancel()   { close(false); }
    function onOk()       { close(true);  }
    function onOverlay(e) { if (e.target === overlay) close(false); }

    cancelBtn.addEventListener("click", onCancel);
    okBtn.addEventListener("click", onOk);
    overlay.addEventListener("click", onOverlay);
  });
}

/* =========================
   Helpers
========================= */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

/* =========================
   Categories
========================= */
const CATEGORY_LABELS = {
  drinks: { label: "مشروبات", icon: "🥤" },
  chips: { label: "شيبسات", icon: "🍟" },
  chocolate: { label: "شوكولاتات", icon: "🍫" },
  jelly: { label: "جلي وجوميات", icon: "🍬" },
  marshmallow: { label: "مارشميلو", icon: "☁️" },
  toffee: { label: "توفي وملبسات", icon: "🍭" },
  bigla: { label: "بيجلا", icon: "🥨" }
};

function getCategoryInfo(category) {
  return CATEGORY_LABELS[category] || { label: "غير مصنف", icon: "❓" };
}

function sortByCreatedAtDesc(items) {
  return [...items].sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime;
  });
}

function showMessage(form, message, type = "success") {
  const oldMessage = form.querySelector(".success-message, .error-message");
  if (oldMessage) oldMessage.remove();

  const div = document.createElement("div");
  div.className = type === "success" ? "success-message" : "error-message";
  div.textContent = message;
  form.appendChild(div);

  setTimeout(() => div.remove(), 4000);
}

function downloadJsonFile(filename, data) {
  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportAllData() {
  if (!isOwner(auth.currentUser)) {
    alert("فقط الأدمن الرئيسي يستطيع تصدير البيانات");
    return;
  }

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    products
  };

  downloadJsonFile("al-atmawi-backup.json", exportPayload);
}

/* =========================
   Cloudinary Upload
========================= */
const CLOUDINARY_CLOUD_NAME = "dooabdkr5";
const CLOUDINARY_UPLOAD_PRESET = "alatmawi";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

/* =========================
   Image Compression
========================= */
async function compressImage(file, maxWidth = 1200, quality = 0.75) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;

        // تصغير الأبعاد إذا كانت أكبر من maxWidth
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }

        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            // إذا فشل الضغط أو الصورة أصغر أصلاً، نرجع الأصلية
            if (!blob || blob.size >= file.size) {
              resolve(file);
            } else {
              resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file); // fallback
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file); // fallback
    reader.readAsDataURL(file);
  });
}

async function uploadToCloudinary(file) {
  // ضغط الصورة قبل الرفع
  const compressed = await compressImage(file);

  const formData = new FormData();
  formData.append("file", compressed);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || "فشل رفع الصورة. تحقق من إعدادات Cloudinary.");
  }

  const data = await response.json();
  return data.secure_url;
}

async function handleImageSelection(fileInput, hiddenInput, previewElement) {
  const file = fileInput.files[0];
  if (!file) return;

  const label = fileInput.closest(".form-group")?.querySelector("label");
  const originalLabel = label?.textContent || "";

  const allowedTypes = ["image/jpeg","image/jpg","image/png"];
  const isAllowed = allowedTypes.includes(file.type) ||
                    file.name.toLowerCase().endsWith(".jpg") ||
                    file.name.toLowerCase().endsWith(".jpeg") ||
                    file.name.toLowerCase().endsWith(".png");

  if (!isAllowed) {
    alert("صيغة الصورة غير مدعومة. استخدم JPG أو PNG فقط");
    fileInput.value = "";
    return;
  }

  try {
    previewElement.src = "";
    previewElement.classList.add("hidden");
    hiddenInput.value = "";

    if (label) label.textContent = "⏳ جاري رفع الصورة...";

    const imageUrl = await uploadToCloudinary(file);

    hiddenInput.value = imageUrl;
    previewElement.src = imageUrl;
    previewElement.classList.remove("hidden");

    if (label) label.textContent = "✅ تم رفع الصورة";
    setTimeout(() => { if (label) label.textContent = originalLabel; }, 3000);

  } catch (error) {
    alert(error.message || "حدث خطأ أثناء رفع الصورة");
    fileInput.value = "";
    hiddenInput.value = "";
    previewElement.src = "";
    previewElement.classList.add("hidden");
    if (label) label.textContent = originalLabel;
  }
}

function updatePreviewFromUrl(url, previewElement, hiddenInput) {
  const value = url.trim();

  if (!value) {
    if (!hiddenInput.value) {
      previewElement.src = "";
      previewElement.classList.add("hidden");
    }
    return;
  }

  previewElement.src = value;
  previewElement.classList.remove("hidden");
}

/* =========================
   Reset Forms
========================= */
function resetProductForm() {
  productForm.reset();
  productIdInput.value = "";
  productPrivatePriceInput.value = "";
  productDistributionPriceInput.value = "";
  productListingTypeInput.value = "normal";
  productAvailabilityInput.value = "available";
  productCategoryInput.value = "drinks";
  productImageDataInput.value = "";
  productPreview.src = "";
  productPreview.classList.add("hidden");
  productFormTitle.textContent = "إضافة منتج جديد";
  productSubmitBtn.textContent = "إضافة المنتج";
  cancelProductEditBtn.classList.add("hidden");
}

/* =========================
   UI Permissions
========================= */
function applyPermissionsUI(user) {
  if (isOwner(user)) {
    adminRoleLabel.textContent = "صلاحيتك: أدمن كامل";
    productFormCard.classList.remove("hidden");
    return;
  }

  adminRoleLabel.textContent = "";
  productFormCard.classList.add("hidden");
}

/* =========================
   Render
========================= */
function renderProductsList() {
  if (adminProductsLoading && !products.length && !productSearchTerm) {
    adminProductsList.innerHTML = `<div class="empty-message">جاري تحميل المنتجات...</div>`;
    return;
  }

  const term = productSearchTerm.trim().toLowerCase();
  const isSearching = term.length > 0;

  // إذا في بحث فعّال، نفلتر على كل المنتجات المحمّلة (مش بس الصفحة الظاهرة حاليًا)
  const displayedProducts = isSearching
    ? allFilteredProducts.filter(product => product.name.toLowerCase().includes(term))
    : products;

  if (!displayedProducts.length) {
    adminProductsList.innerHTML = isSearching
      ? `<div class="empty-message">لا توجد نتائج مطابقة لـ "${escapeHtml(productSearchTerm.trim())}"</div>`
      : `<div class="empty-message">لا توجد منتجات حاليًا</div>`;
    return;
  }

  adminProductsList.innerHTML = `
    ${displayedProducts.map(product => `
        <div class="admin-item admin-item-compact">
          <div class="admin-item-compact-row">
            <div class="admin-item-icon">${getCategoryInfo(product.category).icon}</div>
            <div class="admin-item-info">
              <h4>${escapeHtml(product.name)}</h4>
              <span class="admin-item-category">${escapeHtml(getCategoryInfo(product.category).label)}</span>
              ${product.isOffer ? `<span class="admin-item-offer-badge">🔥 عرض خاص</span>` : ""}
              <span class="admin-item-availability-badge ${product.isAvailable ? "available" : "unavailable"}">${product.isAvailable ? "✅ متوفر" : "❌ غير متوفر"}</span>
            </div>
            ${isOwner(auth.currentUser) ? `
              <div class="admin-item-actions-inline">
                <button class="action-btn edit-btn" data-product-edit="${product.id}">تعديل</button>
                <button class="action-btn delete-btn" data-product-delete="${product.id}">حذف</button>
              </div>
            ` : ""}
          </div>
          ${isOwner(auth.currentUser) ? `
            <div class="admin-quick-categories">
              <button
                type="button"
                class="quick-availability-btn ${product.isAvailable ? "is-available" : "is-unavailable"}"
                data-toggle-availability="${product.id}"
                data-current-availability="${product.isAvailable ? "available" : "unavailable"}"
              >${product.isAvailable ? "✅ متوفر — اضغط لتعطيله" : "❌ غير متوفر — اضغط لتفعيله"}</button>
            </div>
            <div class="admin-quick-categories">
              ${Object.entries(CATEGORY_LABELS).map(([catId, info]) => `
                <button
                  type="button"
                  class="quick-cat-btn ${product.category === catId ? "active" : ""}"
                  data-quick-category="${catId}"
                  data-quick-category-product="${product.id}"
                >${info.icon} ${info.label}</button>
              `).join("")}
            </div>
          ` : ""}
        </div>
      `).join("")}

    ${!isSearching && adminProductsHasMore ? `
      <div class="load-more-wrap">
        <button id="adminLoadMoreProductsBtn" class="btn btn-outline" type="button" ${adminProductsLoading ? "disabled" : ""}>
          ${adminProductsLoading ? "جاري التحميل..." : "عرض المزيد"}
        </button>
      </div>
    ` : ""}
  `;

  if (isOwner(auth.currentUser)) {
    document.querySelectorAll("[data-product-edit]").forEach(btn => {
      btn.addEventListener("click", () => startEditProduct(btn.dataset.productEdit));
    });

    document.querySelectorAll("[data-product-delete]").forEach(btn => {
      btn.addEventListener("click", () => deleteProduct(btn.dataset.productDelete));
    });

    document.querySelectorAll("[data-quick-category]").forEach(btn => {
      btn.addEventListener("click", () => {
        quickSetCategory(btn.dataset.quickCategoryProduct, btn.dataset.quickCategory);
      });
    });

    document.querySelectorAll("[data-toggle-availability]").forEach(btn => {
      btn.addEventListener("click", () => {
        const isCurrentlyAvailable = btn.dataset.currentAvailability === "available";
        quickToggleAvailability(btn.dataset.toggleAvailability, !isCurrentlyAvailable);
      });
    });
  }

  const loadMoreBtn = document.getElementById("adminLoadMoreProductsBtn");
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", loadMoreAdminProducts);
  }
}

/* =========================
   Quick Availability Toggle
========================= */
async function quickToggleAvailability(productId, newAvailability) {
  if (!isOwner(auth.currentUser)) return;

  const btnsForProduct = document.querySelectorAll(`[data-toggle-availability="${productId}"]`);
  btnsForProduct.forEach(b => (b.disabled = true));

  try {
    await updateDoc(doc(db, "products", productId), {
      isAvailable: newAvailability,
      updatedAt: serverTimestamp()
    });

    // تحديث محلي فوري بدون إعادة تحميل كل القائمة
    [products, allFilteredProducts].forEach(list => {
      const item = list.find(p => String(p.id) === String(productId));
      if (item) item.isAvailable = newAvailability;
    });

    renderProductsList();
  } catch (error) {
    console.error(error);
    alert("حدث خطأ أثناء تحديث حالة التوفر");
    btnsForProduct.forEach(b => (b.disabled = false));
  }
}

/* =========================
   Quick Category Assign
========================= */
async function quickSetCategory(productId, category) {
  if (!isOwner(auth.currentUser)) return;
  if (!CATEGORY_LABELS[category]) return;

  const btnsForProduct = document.querySelectorAll(`[data-quick-category-product="${productId}"]`);
  btnsForProduct.forEach(b => (b.disabled = true));

  try {
    await updateDoc(doc(db, "products", productId), {
      category,
      updatedAt: serverTimestamp()
    });

    // تحديث محلي فوري بدون إعادة تحميل كل القائمة
    [products, allFilteredProducts].forEach(list => {
      const item = list.find(p => String(p.id) === String(productId));
      if (item) item.category = category;
    });

    renderProductsList();
  } catch (error) {
    console.error(error);
    alert("حدث خطأ أثناء تحديث التصنيف");
    btnsForProduct.forEach(b => (b.disabled = false));
  }
}

function updateCounters() {
  const counterProducts = document.getElementById("counterProducts");
  if (!counterProducts) return;
  counterProducts.textContent = allFilteredProducts.length;
}

function renderDashboardData() {
  renderProductsList();
  updateCounters();
}

function updateAdminUI(user) {
  loginBox.classList.add("hidden");
  dashboardBox.classList.add("hidden");

  if (!user) {
    loginBox.classList.remove("hidden");
    return;
  }

  if (!isAllowedAdmin(user)) {
    loginBox.classList.remove("hidden");
    showMessage(loginForm, "هذا الحساب غير مصرح له بدخول لوحة الأدمن", "error");
    signOut(auth);
    return;
  }

  dashboardBox.classList.remove("hidden");
  adminDisplayName.textContent = user.email || "Admin";
  applyPermissionsUI(user);
  renderDashboardData();
  updateCounters();
}

/* =========================
   Edit Actions
========================= */
async function startEditProduct(productId) {
  if (!isOwner(auth.currentUser)) return;

  const product = allFilteredProducts.find(item => String(item.id) === String(productId));
  if (!product) return;

  productFormTitle.textContent = "جاري التحميل...";
  productSubmitBtn.textContent = "جاري التحميل...";
  cancelProductEditBtn.classList.remove("hidden");

  try {
    // نجيب البيانات الكاملة مع الصورة بس عند التعديل
    const docSnap = await getDoc(doc(db, "products", productId));
    const fullData = docSnap.exists() ? docSnap.data() : {};
    const image = fullData.image || "";

    // أسعار الفئات محفوظة بمجموعات منفصلة محمية عشان ما تظهرش للعموم
    // privatePricing = سعر الجملة | distributionPricing = سعر التوزيع
    let privatePriceValue = "";
    let distributionPriceValue = "";
    try {
      const privateSnap = await getDoc(doc(db, "privatePricing", productId));
      if (privateSnap.exists()) privatePriceValue = privateSnap.data().price || "";
    } catch (privateError) {
      console.error(privateError);
    }
    try {
      const distSnap = await getDoc(doc(db, "distributionPricing", productId));
      if (distSnap.exists()) distributionPriceValue = distSnap.data().price || "";
    } catch (distError) {
      console.error(distError);
    }

    productIdInput.value = product.id;
    productNameInput.value = product.name;
    productDescInput.value = product.desc;
    productPrivatePriceInput.value = privatePriceValue;
    productDistributionPriceInput.value = distributionPriceValue;
    productListingTypeInput.value = product.isOffer ? "offer" : "normal";
    productAvailabilityInput.value = product.isAvailable === false ? "unavailable" : "available";
    productCategoryInput.value = product.category || "drinks";
    productImageInput.value = String(image).startsWith("data:") ? "" : image;
    productImageDataInput.value = String(image).startsWith("data:") ? image : "";
    productPreview.src = image;
    if (image) productPreview.classList.remove("hidden");

    productFormTitle.textContent = "تعديل المنتج";
    productSubmitBtn.textContent = "حفظ تعديل المنتج";
    productForm.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    console.error(error);
    productFormTitle.textContent = "إضافة منتج جديد";
    productSubmitBtn.textContent = "إضافة المنتج";
  }
}

/* =========================
   Delete Actions
========================= */
async function deleteProduct(productId) {
  if (!isOwner(auth.currentUser)) {
    alert("ليس لديك صلاحية لحذف المنتجات");
    return;
  }

  const product = allFilteredProducts.find(item => String(item.id) === String(productId));
  if (!product) return;

  const confirmed = await showConfirmModal("حذف المنتج", `هل أنت متأكد من حذف المنتج "${product.name}"؟`);
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "products", productId));
    await deleteDoc(doc(db, "privatePricing", productId)).catch(() => {});
    await deleteDoc(doc(db, "distributionPricing", productId)).catch(() => {});

    if (String(productIdInput.value) === String(productId)) resetProductForm();

    await refreshAllAdminData();
  } catch (error) {
    console.error(error);
    alert("حدث خطأ أثناء حذف المنتج");
  }
}

/* =========================
   Auth Events
========================= */
loginForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();

  if (!email || !password) {
    showMessage(loginForm, "يرجى تعبئة البريد الإلكتروني وكلمة المرور", "error");
    return;
  }

  try {
    const result = await signInWithEmailAndPassword(auth, email, password);

    if (!isAllowedAdmin(result.user)) {
      await signOut(auth);
      showMessage(loginForm, "هذا الحساب غير مصرح له بدخول لوحة الأدمن", "error");
      return;
    }

    loginForm.reset();
  } catch {
    showMessage(loginForm, "البريد الإلكتروني أو كلمة المرور غير صحيحة", "error");
  }
});

if (exportDataBtn) {
  exportDataBtn.addEventListener("click", exportAllData);
}

logoutBtn.addEventListener("click", async function () {
  try {
    await signOut(auth);
  } catch {
    alert("حدث خطأ أثناء تسجيل الخروج");
  }
});

/* =========================
   Image Input Events
========================= */
productImageFileInput.addEventListener("change", async () => {
  await handleImageSelection(productImageFileInput, productImageDataInput, productPreview);
  productImageInput.value = "";
});

productImageInput.addEventListener("input", () => {
  if (productImageInput.value.trim()) {
    productImageDataInput.value = "";
    productImageFileInput.value = "";
  }
  updatePreviewFromUrl(productImageInput.value, productPreview, productImageDataInput);
});

/* =========================
   Forms Submit
========================= */
productForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  if (!isOwner(auth.currentUser)) {
    showMessage(productForm, "ليس لديك صلاحية لإضافة أو تعديل المنتجات", "error");
    return;
  }

  const id = productIdInput.value.trim();
  const name = productNameInput.value.trim();
  const desc = productDescInput.value.trim();
  const privatePrice = productPrivatePriceInput.value.trim();
  const distributionPrice = productDistributionPriceInput.value.trim();
  const isOffer = productListingTypeInput.value === "offer";
  const isAvailable = productAvailabilityInput.value !== "unavailable";
  const category = productCategoryInput.value.trim();
  const image = productImageDataInput.value.trim() || productImageInput.value.trim();
  // productImageDataInput الآن يحمل رابط Cloudinary بدل base64

  if (!name || !desc || !category || !image) {
    showMessage(productForm, "يرجى تعبئة جميع الحقول مع الصورة", "error");
    return;
  }

  try {
    let productId = id;

    if (id) {
      await updateDoc(doc(db, "products", id), {
        name,
        desc,
        category,
        isOffer,
        isAvailable,
        image,
        updatedAt: serverTimestamp()
      });
      showMessage(productForm, "تم تعديل المنتج بنجاح", "success");
    } else {
      const newDocRef = await addDoc(collection(db, "products"), {
        name,
        desc,
        category,
        isOffer,
        isAvailable,
        image,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      productId = newDocRef.id;
      showMessage(productForm, "تمت إضافة المنتج بنجاح", "success");
    }

    // السعر الخاص بينحفظ بمجموعة منفصلة محمية (privatePricing) عشان ما يظهرش للزوار العاديين
    if (privatePrice) {
      await setDoc(doc(db, "privatePricing", productId), {
        price: privatePrice,
        updatedAt: serverTimestamp()
      });
    } else {
      await deleteDoc(doc(db, "privatePricing", productId)).catch(() => {});
    }

    // سعر التوزيع (distributionPricing)
    if (distributionPrice) {
      await setDoc(doc(db, "distributionPricing", productId), {
        price: distributionPrice,
        updatedAt: serverTimestamp()
      });
    } else {
      await deleteDoc(doc(db, "distributionPricing", productId)).catch(() => {});
    }

    resetProductForm();
    await refreshAllAdminData();
  } catch (error) {
    console.error(error);
    showMessage(productForm, error.message || "حدث خطأ أثناء حفظ المنتج", "error");
  }
});

cancelProductEditBtn.addEventListener("click", resetProductForm);

if (adminProductsSearchInput) {
  adminProductsSearchInput.addEventListener("input", () => {
    productSearchTerm = adminProductsSearchInput.value;
    renderProductsList();
  });
}

/* =========================
   Data Loading
========================= */
function buildAdminProductsQuery() {
  return query(
    collection(db, "products"),
    orderBy("createdAt", "desc")
  );
}

async function loadInitialAdminProducts() {
  adminProductsLoading = true;
  products = [];
  allFilteredProducts = [];
  adminProductsCursor = 0;
  adminProductsHasMore = false;
  renderProductsList();

  try {
    const productsQuery = buildAdminProductsQuery();
    const snapshot = await getDocs(productsQuery);

    let loadedProducts = snapshot.docs.map(docSnap => {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        name: d.name || "",
        desc: d.desc || "",
        category: d.category || "",
        isOffer: !!d.isOffer,
        isAvailable: d.isAvailable !== false,
        createdAt: d.createdAt || null,
        // image محذوف من القائمة لتخفيف التحميل
        _hasImage: !!d.image
      };
    });

    loadedProducts = sortByCreatedAtDesc(loadedProducts);

    allFilteredProducts = loadedProducts;
    products = loadedProducts.slice(0, ADMIN_PRODUCTS_PAGE_SIZE);
    adminProductsCursor = products.length;
    adminProductsHasMore = adminProductsCursor < allFilteredProducts.length;
  } catch (error) {
    console.error(error);
    products = [];
    allFilteredProducts = [];
    adminProductsCursor = 0;
    adminProductsHasMore = false;
  } finally {
    adminProductsLoading = false;
    renderProductsList();
  }
}

async function loadMoreAdminProducts() {
  if (adminProductsLoading || !adminProductsHasMore) return;

  adminProductsLoading = true;
  renderProductsList();

  try {
    const nextChunk = allFilteredProducts.slice(
      adminProductsCursor,
      adminProductsCursor + ADMIN_PRODUCTS_PAGE_SIZE
    );

    products = [...products, ...nextChunk];
    adminProductsCursor = products.length;
    adminProductsHasMore = adminProductsCursor < allFilteredProducts.length;
  } catch (error) {
    console.error(error);
  } finally {
    adminProductsLoading = false;
    renderProductsList();
  }
}

/* =========================
   Orders (الطلبات)
========================= */
function formatOrderDate(timestamp) {
  if (!timestamp) return "";
  try {
    const dateObj = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
    return dateObj.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

async function loadOrders() {
  if (!isOwner(auth.currentUser)) return;

  ordersLoading = true;
  renderOrdersList();

  try {
    const snapshot = await getDocs(collection(db, "orders"));

    // الأحدث أولًا: أي طلب جديد بيطلع فوق
    allOrders = snapshot.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => {
        const aTime = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        const bTime = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return bTime - aTime;
      });
  } catch (error) {
    console.error(error);
    if (adminOrdersList) {
      adminOrdersList.innerHTML = `<div class="empty-message">حدث خطأ أثناء تحميل الطلبات</div>`;
    }
  } finally {
    ordersLoading = false;
    renderOrdersList();
  }
}

function renderOrdersList() {
  if (!adminOrdersList) return;

  const newOrdersCount = allOrders.filter(o => o.status === "جديد").length;
  if (ordersCountBadge) {
    if (newOrdersCount > 0) {
      ordersCountBadge.textContent = newOrdersCount;
      ordersCountBadge.classList.remove("hidden");
    } else {
      ordersCountBadge.classList.add("hidden");
    }
  }

  if (ordersLoading && !allOrders.length) {
    adminOrdersList.innerHTML = `<div class="empty-message">جاري تحميل الطلبات...</div>`;
    return;
  }

  const term = orderSearchTerm.trim().toLowerCase();
  const filtered = term
    ? allOrders.filter(o => (o.customerName || "").toLowerCase().includes(term))
    : allOrders;

  if (!filtered.length) {
    adminOrdersList.innerHTML = `<div class="empty-message">${term ? "ما في طلبات مطابقة للبحث" : "لا توجد طلبات حاليًا"}</div>`;
    return;
  }

  adminOrdersList.innerHTML = filtered.map(order => `
    <div class="admin-item order-item">
      <div class="order-item-head">
        <div>
          <h4>${escapeHtml(order.customerName || "بدون اسم")}</h4>
          <span class="admin-item-category">${escapeHtml(order.customerEmail || "")}</span>
          ${order.regionLabel ? `<span class="admin-item-category">📍 ${escapeHtml(order.regionLabel)}</span>` : ""}
          ${TIER_LABELS[order.customerTier] ? `<span class="admin-item-tier-badge tier-${escapeHtml(order.customerTier)}">${TIER_LABELS[order.customerTier]}</span>` : ""}
          ${order.customerPhone ? `<a class="order-whatsapp-link" href="https://wa.me/${escapeHtml(order.customerPhone.replace(/\D/g, ""))}" target="_blank" rel="noopener">📱 ${escapeHtml(order.customerPhone)}</a>` : ""}
        </div>
        <span class="order-date">${escapeHtml(formatOrderDate(order.createdAt))}</span>
      </div>
      <ul class="order-items-list">
        ${(order.items || []).map(item => `
          <li>${escapeHtml(item.name || "")} × ${escapeHtml(String(item.qty || 1))}${item.price ? ` — ${escapeHtml(item.price)}` : ""}</li>
        `).join("")}
        ${order.total ? `<li class="order-total-line">المبلغ المطلوب ( غير شامل التوصيل ): ${escapeHtml(String(order.total))}</li>` : ""}
        ${order.deliveryFee ? `<li>سعر التوصيل: ${escapeHtml(String(order.deliveryFee))}</li>` : ""}
      </ul>
      <div class="order-item-actions">
        <select data-order-status="${order.id}">
          <option value="جديد" ${order.status === "جديد" ? "selected" : ""}>🆕 جديد</option>
          <option value="تم التواصل" ${order.status === "تم التواصل" ? "selected" : ""}>📞 تم التواصل</option>
          <option value="مكتمل" ${order.status === "مكتمل" ? "selected" : ""}>✅ مكتمل</option>
        </select>
        <button class="action-btn delete-btn" data-order-delete="${order.id}">حذف</button>
      </div>
    </div>
  `).join("");

  adminOrdersList.querySelectorAll("[data-order-status]").forEach(select => {
    select.addEventListener("change", () => updateOrderStatus(select.dataset.orderStatus, select.value));
  });
  adminOrdersList.querySelectorAll("[data-order-delete]").forEach(btn => {
    btn.addEventListener("click", () => deleteOrder(btn.dataset.orderDelete));
  });
}

async function updateOrderStatus(orderId, status) {
  if (!isOwner(auth.currentUser)) return;
  try {
    await updateDoc(doc(db, "orders", orderId), { status });
    const order = allOrders.find(o => o.id === orderId);
    if (order) order.status = status;
    renderOrdersList();
  } catch (error) {
    console.error(error);
    alert("حدث خطأ أثناء تحديث حالة الطلب");
  }
}

async function deleteOrder(orderId) {
  if (!isOwner(auth.currentUser)) return;

  const confirmed = await showConfirmModal("حذف الطلب", "هل أنت متأكد من حذف هذا الطلب؟");
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "orders", orderId));
    allOrders = allOrders.filter(o => o.id !== orderId);
    renderOrdersList();
  } catch (error) {
    console.error(error);
    alert("حدث خطأ أثناء حذف الطلب");
  }
}

if (adminOrdersSearchInput) {
  adminOrdersSearchInput.addEventListener("input", () => {
    orderSearchTerm = adminOrdersSearchInput.value;
    renderOrdersList();
  });
}

if (refreshOrdersBtn) {
  refreshOrdersBtn.addEventListener("click", () => loadOrders());
}

async function refreshAllAdminData() {
  await loadInitialAdminProducts();
  renderDashboardData();
  updateCounters();
}

/* =========================
   Customers & Price Tiers (الزبائن وفئات الأسعار)
========================= */
const TIER_LABELS = {
  wholesale: "💼 جملة",
  distribution: "🚚 توزيع"
};

let allCustomers = [];
let customerSearchTerm = "";

const adminCustomersList = document.getElementById("adminCustomersList");
const adminCustomersSearchInput = document.getElementById("adminCustomersSearch");
const refreshCustomersBtn = document.getElementById("refreshCustomersBtn");

async function loadCustomers() {
  if (!isOwner(auth.currentUser) || !adminCustomersList) return;

  adminCustomersList.innerHTML = `<div class="empty-message">جاري تحميل الزبائن...</div>`;

  try {
    const snapshot = await getDocs(collection(db, "customers"));
    allCustomers = snapshot.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => {
        const aTime = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        const bTime = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return bTime - aTime;
      });
    renderCustomersList();
  } catch (error) {
    console.error(error);
    adminCustomersList.innerHTML = `<div class="empty-message">حدث خطأ أثناء تحميل الزبائن</div>`;
  }
}

function renderCustomersList() {
  if (!adminCustomersList) return;

  const term = customerSearchTerm.trim().toLowerCase();
  const filtered = term
    ? allCustomers.filter(c =>
        (c.name || "").toLowerCase().includes(term) ||
        (c.email || "").toLowerCase().includes(term) ||
        (c.phone || "").includes(term))
    : allCustomers;

  if (!filtered.length) {
    adminCustomersList.innerHTML = `<div class="empty-message">${term ? "ما في زبائن مطابقين للبحث" : "لا يوجد زبائن مسجلين حاليًا"}</div>`;
    return;
  }

  adminCustomersList.innerHTML = filtered.map(customer => {
    const tier = customer.tier || "";
    return `
      <div class="admin-item customer-item">
        <div class="customer-item-info">
          <h4>${escapeHtml(customer.name || "بدون اسم")}</h4>
          <span class="admin-item-category">${escapeHtml(customer.email || "")}</span>
          ${customer.phone ? `<span class="admin-item-category">📱 ${escapeHtml(customer.phone)}</span>` : ""}
        </div>
        <div class="customer-tier-buttons">
          <button type="button" class="tier-btn ${tier === "" ? "active" : ""}" data-set-tier="" data-customer-id="${customer.id}">👤 عادي</button>
          <button type="button" class="tier-btn ${tier === "wholesale" ? "active" : ""}" data-set-tier="wholesale" data-customer-id="${customer.id}">💼 جملة</button>
          <button type="button" class="tier-btn ${tier === "distribution" ? "active" : ""}" data-set-tier="distribution" data-customer-id="${customer.id}">🚚 توزيع</button>
        </div>
      </div>
    `;
  }).join("");

  adminCustomersList.querySelectorAll("[data-set-tier]").forEach(btn => {
    btn.addEventListener("click", () => setCustomerTier(btn.dataset.customerId, btn.dataset.setTier));
  });
}

async function setCustomerTier(customerId, tier) {
  if (!isOwner(auth.currentUser)) return;

  const buttons = adminCustomersList.querySelectorAll(`[data-customer-id="${customerId}"]`);
  buttons.forEach(b => (b.disabled = true));

  try {
    await updateDoc(doc(db, "customers", customerId), {
      tier,
      tierUpdatedAt: serverTimestamp()
    });
    const customer = allCustomers.find(c => c.id === customerId);
    if (customer) customer.tier = tier;
    renderCustomersList();
  } catch (error) {
    console.error(error);
    alert("حدث خطأ أثناء تغيير فئة الزبون");
    buttons.forEach(b => (b.disabled = false));
  }
}

if (adminCustomersSearchInput) {
  adminCustomersSearchInput.addEventListener("input", () => {
    customerSearchTerm = adminCustomersSearchInput.value;
    renderCustomersList();
  });
}

if (refreshCustomersBtn) {
  refreshCustomersBtn.addEventListener("click", () => loadCustomers());
}

/* =========================
   Auth State
========================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    products = [];
    allFilteredProducts = [];
    adminProductsCursor = 0;
    adminProductsHasMore = false;
    adminProductsLoading = false;
    allOrders = [];
    allCustomers = [];
    updateAdminUI(null);
    return;
  }

  if (!isAllowedAdmin(user)) {
    updateAdminUI(null);
    alert("هذا الحساب غير مصرح له بدخول لوحة الأدمن");
    await signOut(auth);
    return;
  }

  updateAdminUI(user);

  await loadInitialAdminProducts();
  await loadOrders();
  await loadCustomers();

  renderDashboardData();
  updateCounters();
});
