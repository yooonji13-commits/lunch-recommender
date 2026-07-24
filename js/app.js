// ===== 상수 =====
const CATEGORY_CODE = "FD6"; // 카카오 로컬 API: 음식점 카테고리 코드
const INITIAL_SHOW = 10;
const INCREMENT = 10;
const MAX_TOTAL = 30;
const API_PAGE_SIZE = 15;
const FAV_KEY = "lunch_favorites_v1";
const RECENT_KEY = "lunch_recent_v1";

// ===== 상태 =====
const state = {
  lat: null,
  lng: null,
  radius: 1000,
  keyword: "",
  results: [],
  ids: new Set(),
  page: 1,
  isEnd: false,
  renderCount: 0,
  lastRandomId: null,
  sortMode: "distance",
};

// ===== DOM =====
const $ = (sel) => document.querySelector(sel);
const listEl = $("#list");
const skeletonEl = $("#listSkeleton");
const emptyEl = $("#emptyState");
const loadMoreBtn = $("#loadMoreBtn");
const resultMetaEl = $("#resultMeta");
const statusBanner = $("#statusBanner");
const toastEl = $("#toast");

// ===== 유틸 =====
function formatDistance(m) {
  const n = Number(m);
  if (Number.isNaN(n)) return "";
  return n < 1000 ? `${n}m` : `${(n / 1000).toFixed(1)}km`;
}

const WALK_METERS_PER_MIN = 67; // 평균 도보 속도(약 4km/h) 기준
function formatWalkTime(m) {
  const n = Number(m);
  if (Number.isNaN(n)) return "";
  const mins = Math.max(1, Math.round(n / WALK_METERS_PER_MIN));
  return `도보 ${mins}분`;
}

function simplifyCategory(catName) {
  if (!catName) return "";
  const parts = catName.split(">").map((s) => s.trim());
  return parts.slice(1).join(" · ") || parts[0];
}

function showToast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toastEl.hidden = true; }, ms);
}

function setBanner(msg, type = "info") {
  if (!msg) { statusBanner.hidden = true; return; }
  statusBanner.hidden = false;
  statusBanner.className = "status-banner" + (type === "error" ? " error" : "");
  statusBanner.innerHTML = msg;
}

function getFavorites() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || "{}"); } catch { return {}; }
}
function saveFavorites(obj) { localStorage.setItem(FAV_KEY, JSON.stringify(obj)); }

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function saveRecent(arr) { localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 20))); }

function isFav(id) { return !!getFavorites()[id]; }

function toggleFavorite(place) {
  const favs = getFavorites();
  if (favs[place.id]) {
    delete favs[place.id];
  } else {
    favs[place.id] = place;
  }
  saveFavorites(favs);
  updateFavCount();
  return !!favs[place.id];
}

function updateFavCount() {
  $("#favCount").textContent = Object.keys(getFavorites()).length;
}

function pushRecent(place) {
  let recent = getRecent().filter((p) => p.id !== place.id);
  recent.unshift(place);
  saveRecent(recent);
}

// ===== 카카오 API =====
function kakaoHeaders() {
  return { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` };
}

async function fetchPlacesPage(page) {
  if (!KAKAO_REST_API_KEY) {
    throw new Error("NO_KEY");
  }
  const base = state.keyword
    ? "https://dapi.kakao.com/v2/local/search/keyword.php"
    : "https://dapi.kakao.com/v2/local/search/category.php";

  const params = new URLSearchParams({
    x: String(state.lng),
    y: String(state.lat),
    radius: String(state.radius),
    sort: "distance",
    size: String(API_PAGE_SIZE),
    page: String(page),
    category_group_code: CATEGORY_CODE,
  });
  if (state.keyword) params.set("query", state.keyword);

  const res = await fetch(`${base}?${params.toString()}`, { headers: kakaoHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API_ERROR_${res.status}:${body}`);
  }
  return res.json();
}

async function loadMorePage() {
  const data = await fetchPlacesPage(state.page);
  for (const doc of data.documents) {
    if (state.ids.has(doc.id)) continue;
    if (state.results.length >= MAX_TOTAL) break;
    state.ids.add(doc.id);
    state.results.push(doc);
  }
  state.isEnd = data.meta.is_end || state.results.length >= MAX_TOTAL;
  state.page += 1;
}

// ===== 목록 렌더 =====
function getSortedResults() {
  const arr = state.results.slice();
  if (state.sortMode === "name") {
    arr.sort((a, b) => a.place_name.localeCompare(b.place_name, "ko"));
  }
  return arr;
}

function renderList() {
  listEl.innerHTML = "";
  const slice = getSortedResults().slice(0, state.renderCount);
  for (const place of slice) {
    listEl.appendChild(buildCard(place));
  }
  emptyEl.hidden = state.results.length > 0;
  if (state.results.length === 0) {
    resultMetaEl.textContent = "";
  } else if (state.results.length < INITIAL_SHOW) {
    resultMetaEl.textContent = `반경 내 ${state.results.length}개 결과 (더 많은 결과를 보려면 반경을 넓혀보세요)`;
  } else {
    resultMetaEl.textContent = `총 ${state.results.length}개 중 ${state.renderCount}개 표시`;
  }
  updateLoadMoreVisibility();
}

function updateLoadMoreVisibility() {
  const canShowMore = state.renderCount < state.results.length || (!state.isEnd && state.results.length < MAX_TOTAL);
  loadMoreBtn.hidden = !canShowMore || state.renderCount >= MAX_TOTAL;
}

function buildCard(place) {
  const li = document.createElement("li");
  li.className = "card";
  const fav = isFav(place.id);
  li.innerHTML = `
    <div class="card-main">
      <div class="card-top">
        <p class="card-name">${escapeHtml(place.place_name)}</p>
        <span class="card-dist">
          <span class="dist-m">${formatDistance(place.distance)}</span>
          <span class="dist-walk">${formatWalkTime(place.distance)}</span>
        </span>
      </div>
      <p class="card-cat">${escapeHtml(simplifyCategory(place.category_name))}</p>
      <p class="card-addr">${escapeHtml(place.road_address_name || place.address_name || "")}</p>
    </div>
    <button class="fav-btn" aria-label="즐겨찾기">${fav ? "❤️" : "🤍"}</button>
  `;
  li.querySelector(".fav-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const nowFav = toggleFavorite(place);
    e.currentTarget.textContent = nowFav ? "❤️" : "🤍";
    showToast(nowFav ? "즐겨찾기에 추가했어요" : "즐겨찾기에서 제거했어요");
    if ($("#tab-favorites").classList.contains("active")) renderFavorites();
  });
  li.addEventListener("click", () => openDetail(place));
  return li;
}

// ===== 상세 모달 =====
function openDetail(place) {
  pushRecent(place);
  const modal = $("#detailModal");
  const body = $("#detailBody");
  const fav = isFav(place.id);
  const kakaoDirectUrl = `https://map.kakao.com/link/to/${encodeURIComponent(place.place_name)},${place.y},${place.x}`;
  const telHref = place.phone ? `tel:${place.phone.replace(/[^0-9+]/g, "")}` : null;

  body.innerHTML = `
    <p class="detail-title">${escapeHtml(place.place_name)} ${fav ? "❤️" : ""}</p>
    <p class="detail-cat">${escapeHtml(simplifyCategory(place.category_name))}</p>

    <div class="detail-row"><span class="label">거리</span><span class="value">${formatDistance(place.distance)} · ${formatWalkTime(place.distance)}</span></div>
    <div class="detail-row"><span class="label">주소</span><span class="value">${escapeHtml(place.road_address_name || place.address_name || "정보 없음")}</span></div>
    <div class="detail-row"><span class="label">전화</span><span class="value">${escapeHtml(place.phone || "정보 없음")}</span></div>

    <div class="detail-note">
      메뉴·가격·별점·상세 영업시간은 카카오맵 API에서 제공하지 않아, 아래 <b>"카카오맵에서 상세보기"</b>를 누르면 실제 등록된 사진·메뉴·리뷰·영업시간을 바로 확인할 수 있어요.
    </div>

    <div class="detail-actions">
      <a class="primary" href="${place.place_url}" target="_blank" rel="noopener"><span class="emoji">📋</span>상세보기</a>
      <a href="${kakaoDirectUrl}" target="_blank" rel="noopener"><span class="emoji">🧭</span>길찾기</a>
      ${telHref ? `<a href="${telHref}"><span class="emoji">📞</span>전화</a>` : `<button disabled><span class="emoji">📞</span>전화없음</button>`}
      <button id="detailFavBtn"><span class="emoji">${fav ? "❤️" : "🤍"}</span>즐겨찾기</button>
    </div>
  `;

  $("#detailFavBtn").addEventListener("click", () => {
    const nowFav = toggleFavorite(place);
    openDetail(place); // 재렌더
    showToast(nowFav ? "즐겨찾기에 추가했어요" : "즐겨찾기에서 제거했어요");
    if ($("#tab-favorites").classList.contains("active")) renderFavorites();
  });

  modal.hidden = false;
}

$("#detailClose").addEventListener("click", () => { $("#detailModal").hidden = true; });
$("#detailModal").addEventListener("click", (e) => {
  if (e.target.id === "detailModal") $("#detailModal").hidden = true;
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ===== 즐겨찾기 / 최근 본 가게 탭 =====
function renderFavorites() {
  const favs = Object.values(getFavorites());
  const ul = $("#favList");
  ul.innerHTML = "";
  favs.forEach((p) => ul.appendChild(buildCard(p)));
  $("#favEmpty").hidden = favs.length > 0;
  updateFavCount();
}

function renderRecent() {
  const recent = getRecent();
  const ul = $("#recentList");
  ul.innerHTML = "";
  recent.forEach((p) => ul.appendChild(buildCard(p)));
  $("#recentEmpty").hidden = recent.length > 0;
}

// ===== 탭 전환 =====
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    $(`#tab-${tab}`).classList.add("active");
    if (tab === "favorites") renderFavorites();
    if (tab === "recent") renderRecent();
    if (tab === "map") renderMapView();
  });
});

// ===== 반경 / 카테고리 칩 =====
$("#radiusGroup").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  document.querySelectorAll("#radiusGroup .chip").forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  state.radius = Number(btn.dataset.radius);
  loadInitial();
});

$("#categoryGroup").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  document.querySelectorAll("#categoryGroup .chip").forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  state.keyword = btn.dataset.kw || "";
  loadInitial();
});

$("#sortGroup").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  document.querySelectorAll("#sortGroup .chip").forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  state.sortMode = btn.dataset.sort;
  renderList();
});

// ===== 더보기 =====
loadMoreBtn.addEventListener("click", async () => {
  loadMoreBtn.disabled = true;
  loadMoreBtn.textContent = "불러오는 중...";
  try {
    const target = Math.min(state.renderCount + INCREMENT, MAX_TOTAL);
    while (state.results.length < target && !state.isEnd) {
      await loadMorePage();
    }
    state.renderCount = Math.min(target, state.results.length);
    renderList();
    if (kakaoMap) renderMapMarkers();
  } catch (err) {
    handleFetchError(err);
  } finally {
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = "더보기";
  }
});

// ===== 새로고침 =====
$("#refreshBtn").addEventListener("click", () => locateAndLoad());

// ===== 목록 초기 로드 =====
async function loadInitial() {
  state.results = [];
  state.ids = new Set();
  state.page = 1;
  state.isEnd = false;
  state.renderCount = 0;

  listEl.innerHTML = "";
  emptyEl.hidden = true;
  loadMoreBtn.hidden = true;
  skeletonEl.hidden = false;
  resultMetaEl.textContent = "";

  try {
    while (state.results.length < INITIAL_SHOW && !state.isEnd) {
      await loadMorePage();
    }
    state.renderCount = Math.min(INITIAL_SHOW, state.results.length);
    renderList();
    if (kakaoMap) renderMapMarkers();
  } catch (err) {
    handleFetchError(err);
  } finally {
    skeletonEl.hidden = true;
  }
}

function handleFetchError(err) {
  const msg = String(err && err.message || err);
  if (msg === "NO_KEY") {
    setBanner(
      `설정이 필요해요. <b>js/config.js</b> 파일의 <code>KAKAO_REST_API_KEY</code>에 카카오 개발자센터에서 발급받은 REST API 키를 입력해주세요.`,
      "error"
    );
  } else {
    setBanner("음식점 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.", "error");
    console.error(err);
  }
}

// ===== 랜덤고르기 탭 =====
let currentRandomPlace = null;
const randomSpinEl = $("#randomSpin");
const randomPlaceholderEl = $("#randomPlaceholder");
const randomResultEl = $("#randomResult");
const randomPickBtn = $("#randomPickBtn");
const randomDetailBtn = $("#randomDetailBtn");

randomPickBtn.addEventListener("click", () => {
  if (state.results.length === 0) {
    showToast("먼저 주변맛집 탭에서 목록을 불러와주세요");
    return;
  }
  spinRandom();
});

function spinRandom() {
  randomSpinEl.classList.add("spinning");
  setTimeout(() => {
    randomSpinEl.classList.remove("spinning");
    const pool = state.results.length > 1
      ? state.results.filter((p) => p.id !== state.lastRandomId)
      : state.results;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    state.lastRandomId = picked.id;
    currentRandomPlace = picked;

    randomPlaceholderEl.hidden = true;
    randomResultEl.hidden = false;
    randomResultEl.innerHTML = `
      <p class="info-name">${escapeHtml(picked.place_name)}</p>
      <p class="info-cat">${escapeHtml(simplifyCategory(picked.category_name))}</p>
      <div class="info-row"><span class="label">거리</span><span class="value">${formatDistance(picked.distance)} · ${formatWalkTime(picked.distance)}</span></div>
      <div class="info-row"><span class="label">주소</span><span class="value">${escapeHtml(picked.road_address_name || picked.address_name || "정보 없음")}</span></div>
      <div class="info-row"><span class="label">전화</span><span class="value">${escapeHtml(picked.phone || "정보 없음")}</span></div>
    `;
    randomPickBtn.textContent = "🎲 다른 메뉴 뽑기";
    randomDetailBtn.hidden = false;
  }, 550);
}

randomDetailBtn.addEventListener("click", () => {
  if (!currentRandomPlace) return;
  openDetail(currentRandomPlace);
});

// ===== 지도 탭 =====
let kakaoMapsLoading = null;
function loadKakaoMapsSdk() {
  if (window.kakao && window.kakao.maps) return Promise.resolve();
  if (kakaoMapsLoading) return kakaoMapsLoading;
  kakaoMapsLoading = new Promise((resolve, reject) => {
    if (!KAKAO_JS_KEY) { reject(new Error("NO_JS_KEY")); return; }
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false`;
    script.onerror = () => reject(new Error("SDK_LOAD_FAIL"));
    script.onload = () => window.kakao.maps.load(resolve);
    document.head.appendChild(script);
  });
  return kakaoMapsLoading;
}

let kakaoMap = null;
let mapMarkers = [];
let myLocationOverlay = null;
let radiusCircle = null;
const mapContainerEl = $("#mapContainer");
const mapInfoPanelEl = $("#mapInfoPanel");
const mapInfoBodyEl = $("#mapInfoBody");

function levelForRadius(r) {
  if (r <= 1000) return 5;
  if (r <= 5000) return 7;
  return 9;
}

function renderMapView() {
  if (!KAKAO_JS_KEY) {
    mapContainerEl.textContent = "지도를 쓰려면 js/config.js에 KAKAO_JS_KEY를 입력해주세요.";
    return;
  }
  if (state.lat == null) {
    mapContainerEl.textContent = "위치 정보를 가져오는 중이에요.";
    return;
  }
  loadKakaoMapsSdk()
    .then(() => {
      const center = new kakao.maps.LatLng(state.lat, state.lng);
      if (!kakaoMap) {
        mapContainerEl.textContent = "";
        kakaoMap = new kakao.maps.Map(mapContainerEl, { center, level: levelForRadius(state.radius) });
        kakaoMap.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
      } else {
        kakaoMap.setCenter(center);
        kakaoMap.setLevel(levelForRadius(state.radius));
        kakaoMap.relayout();
      }
      renderMapMarkers();
    })
    .catch(() => {
      mapContainerEl.textContent = "지도를 불러오지 못했어요. 카카오 개발자센터 JavaScript 키에 이 도메인이 등록되어 있는지 확인해주세요.";
    });
}

function renderMapMarkers() {
  if (!kakaoMap) return;
  mapMarkers.forEach((m) => m.setMap(null));
  mapMarkers = [];
  if (myLocationOverlay) myLocationOverlay.setMap(null);
  if (radiusCircle) radiusCircle.setMap(null);

  const myPos = new kakao.maps.LatLng(state.lat, state.lng);
  myLocationOverlay = new kakao.maps.CustomOverlay({
    position: myPos,
    map: kakaoMap,
    zIndex: 10,
    content: '<div style="width:16px;height:16px;border-radius:50%;background:#4285F4;border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>',
  });

  radiusCircle = new kakao.maps.Circle({
    center: myPos,
    radius: state.radius,
    strokeWeight: 2,
    strokeColor: "#FF3B30",
    strokeOpacity: 0.8,
    strokeStyle: "solid",
    fillColor: "#FF3B30",
    fillOpacity: 0.08,
  });
  radiusCircle.setMap(kakaoMap);

  state.results.forEach((place) => {
    const pos = new kakao.maps.LatLng(Number(place.y), Number(place.x));
    const marker = new kakao.maps.Marker({ position: pos, map: kakaoMap, title: place.place_name });
    kakao.maps.event.addListener(marker, "click", () => showMapInfo(place));
    mapMarkers.push(marker);
  });
}

function showMapInfo(place) {
  mapContainerEl.classList.add("shrunk");
  setTimeout(() => kakaoMap && kakaoMap.relayout(), 260);

  mapInfoBodyEl.innerHTML = `
    <p class="info-name">${escapeHtml(place.place_name)}</p>
    <p class="info-cat">${escapeHtml(simplifyCategory(place.category_name))}</p>
    <div class="info-row"><span class="label">거리</span><span class="value">${formatDistance(place.distance)} · ${formatWalkTime(place.distance)}</span></div>
    <div class="info-row"><span class="label">주소</span><span class="value">${escapeHtml(place.road_address_name || place.address_name || "정보 없음")}</span></div>
    <div class="info-row"><span class="label">전화</span><span class="value">${escapeHtml(place.phone || "정보 없음")}</span></div>
    <button id="mapInfoDetailBtn" class="random-detail-btn">자세히 보기</button>
  `;
  $("#mapInfoDetailBtn").addEventListener("click", () => openDetail(place));
  mapInfoPanelEl.hidden = false;
}

function hideMapInfo() {
  mapInfoPanelEl.hidden = true;
  mapContainerEl.classList.remove("shrunk");
  setTimeout(() => kakaoMap && kakaoMap.relayout(), 260);
}

$("#mapInfoClose").addEventListener("click", hideMapInfo);

// ===== 위치 =====
function locateAndLoad() {
  if (!navigator.geolocation) {
    setBanner("이 브라우저는 위치 정보를 지원하지 않아요.", "error");
    return;
  }
  setBanner("현재 위치를 가져오는 중...");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.lat = pos.coords.latitude;
      state.lng = pos.coords.longitude;
      setBanner("");
      loadInitial();
    },
    (err) => {
      let msg = "위치 정보를 가져오지 못했어요.";
      if (err.code === err.PERMISSION_DENIED) {
        msg = `위치 권한이 꺼져 있어요. iPhone <b>설정 &gt; Safari(또는 이 앱) &gt; 위치</b>에서 허용으로 바꾼 뒤 새로고침 버튼을 눌러주세요.`;
      }
      setBanner(msg + ` <button id="retryLocBtn" style="margin-left:6px;border:none;background:none;color:#FF3B30;font-weight:700;text-decoration:underline;">다시 시도</button>`, "error");
      const retryBtn = document.getElementById("retryLocBtn");
      if (retryBtn) retryBtn.addEventListener("click", locateAndLoad);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

// ===== 초기화 =====
updateFavCount();
locateAndLoad();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
