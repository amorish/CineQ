// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "REDACTED_API_KEY",
  authDomain: "cineq-92fea.firebaseapp.com",
  projectId: "cineq-92fea",
  storageBucket: "cineq-92fea.firebasestorage.app",
  messagingSenderId: "671773564359",
  appId: "1:671773564359:web:3fa55f1686cdcb23584de2",
  measurementId: "G-JW5Q56HE28"
};

let db = null;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
} catch (e) { console.error("Firebase not configured:", e); }

let currentUser = null;
let isSignupMode = false;

// ===== TMDB API =====
const TMDB_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyY2EyZWYxM2Y4NWJmY2YwODc0YTdmNjJmZGM4OWY5NSIsIm5iZiI6MTc3MjEwMTM5My4zOCwic3ViIjoiNjlhMDFmMTExN2FmMmI2N2FjZjIwNGM1Iiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9.2wW5LAadCteViThq_vmnujZgGOpg1eFE9y-ObGoF9lk';
const TMDB_BASE = '/api/tmdb';
const TMDB_IMG  = '/images/tmdb/w500';
const TMDB_IMG_LG = '/images/tmdb/w780';

function tmdbFetch(path) {
  return fetch(`${TMDB_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${TMDB_TOKEN}`, 'Content-Type': 'application/json' }
  });
}
function getPosterUrl(posterPath, large = false) {
  if (!posterPath) return '';
  return `${large ? TMDB_IMG_LG : TMDB_IMG}${posterPath}`;
}
function getTitle(item) { return item.title || item.name || ''; }
function getYear(item) {
  const d = item.release_date || item.first_air_date || '';
  return d ? d.split('-')[0] : null;
}
function formatRuntime(minutes) {
  if (!minutes) return '-';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ===== SETTINGS STATE =====
let userSettings = {
  theme: 'dark',
  defaultView: 'list',
  defaultSort: 'added',
  defaultSortOrder: 'desc',
  sfwFilter: true,
  customList: { name: '', position: '6' }
};

// ===== DISPOSABLE EMAIL BLOCKLIST =====
const BLOCKED_EMAIL_DOMAINS = new Set([
  'tempmail.com','temp-mail.org','guerrillamail.com','guerrillamail.net','guerrillamail.org',
  'guerrillamailblock.com','grr.la','sharklasers.com','guerrillamail.de','throwaway.email',
  'yopmail.com','yopmail.fr','mailinator.com','maildrop.cc','dispostable.com',
  'trashmail.com','trashmail.net','trashmail.me','trashmail.org','mailnesia.com',
  'tempail.com','tempr.email','10minutemail.com','10minutemail.net','minutemail.com',
  'mohmal.com','getnada.com','emailondeck.com','33mail.com','mailcatch.com',
  'fakeinbox.com','fakemail.net','deadaddress.com','discard.email','discardmail.com',
  'mail.tm','tempmailo.com','internxt.com','luxusmail.org','tmail.ws',
  'guerrillamail.info','guerrillamail.biz','spam4.me','spamobox.com','spamspot.com',
  'throwam.com','spamgourmet.com','spamgourmet.net','spamgourmet.org','spamboy.com',
]);

function isDisposableEmail(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return true;
  return BLOCKED_EMAIL_DOMAINS.has(domain);
}
function isValidEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function togglePassword() {
  const pwdInput = document.getElementById('authPwd');
  const icon = document.getElementById('pwdEyeIcon');
  if (pwdInput.type === 'password') {
    pwdInput.type = 'text';
    icon.setAttribute('data-lucide', 'eye');
  } else {
    pwdInput.type = 'password';
    icon.setAttribute('data-lucide', 'eye-off');
  }
  lucide.createIcons();
}

// ===== AUTH STATE CHANGE =====
firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    if (!user.emailVerified) {
      currentUser = null;
      showVerificationScreen(user.email);
      hideSplash();
      return;
    }
    currentUser = user;
    document.getElementById('authOverlay').style.display = 'none';
    document.getElementById('verifyOverlay').style.display = 'none';
    document.getElementById('userBadge').style.display = 'flex';
    loadEpCacheForUser(user.uid);
    const displayName = user.displayName || user.email;
    document.getElementById('userEmail').innerHTML =
      `<span class="profile-hi">Hi</span><span class="profile-username">@${escHtml(displayName)}</span>`;
    try {
      await Promise.all([syncSettingsFromFirestore(), loadWatchlist()]);
    } catch (e) { console.error("Error during parallel initialization:", e); }
    applyWatchlistPreferencesOnLoad();
    hideSplash();
  } else {
    currentUser = null;
    watchlist = [];
    epCache = {};
    epCacheKey = 'cineq_ep_cache';
    document.getElementById('authOverlay').style.display = 'flex';
    document.getElementById('verifyOverlay').style.display = 'none';
    document.getElementById('userBadge').style.display = 'none';
    renderGrid();
    hideSplash();
  }
});

function showVerificationScreen(email) {
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('verifyOverlay').style.display = 'flex';
  document.getElementById('verifyEmail').textContent = email;
}

async function resendVerification() {
  const user = firebase.auth().currentUser;
  if (!user) return showToast('No user logged in');
  const btn = document.getElementById('resendBtn');
  btn.disabled = true;
  btn.textContent = 'Sending...';
  try {
    await user.sendEmailVerification();
    showToast('Verification email sent! Check your inbox & spam.');
  } catch (e) {
    if (e.code === 'auth/too-many-requests') showToast('Too many attempts. Wait a few minutes.');
    else showToast('Failed to send. Try again later.');
  } finally {
    btn.textContent = 'Resend Email';
    setTimeout(() => { btn.disabled = false; }, 30000);
  }
}

async function checkVerification() {
  const user = firebase.auth().currentUser;
  if (!user) return;
  await user.reload();
  if (user.emailVerified) {
    currentUser = user;
    document.getElementById('verifyOverlay').style.display = 'none';
    document.getElementById('userBadge').style.display = 'flex';
    const displayName = user.displayName || user.email;
    document.getElementById('userEmail').innerHTML =
      `<span class="profile-hi">Hi</span><span class="profile-username">@${escHtml(displayName)}</span>`;
    showToast('Email verified successfully.');
    await loadWatchlist();
  } else {
    showToast('Email not verified yet. Check your inbox.');
  }
}

function verifyLogout() { firebase.auth().signOut(); }

function toggleAuthMode() {
  isSignupMode = !isSignupMode;
  document.getElementById('authTitle').textContent = isSignupMode ? "Create Account" : "Sign In";
  document.getElementById('authActionBtn').textContent = isSignupMode ? "Sign Up" : "Sign In";
  document.getElementById('authFooterText').textContent = isSignupMode ? "Already have an account?" : "New here?";
  document.getElementById('authToggleBtn').textContent = isSignupMode ? "Sign in" : "Sign up";
  document.getElementById('authUsernameGroup').style.display = isSignupMode ? "block" : "none";
}

async function handleAuth() {
  const email = document.getElementById('authEmail').value.trim();
  const pwd = document.getElementById('authPwd').value;
  const username = document.getElementById('authUsername').value.trim();
  if (isSignupMode && (!email || !pwd || !username)) return showToast('Enter username, email, and password');
  if (isSignupMode && username.length > 15) return showToast('Username cannot be more than 15 characters');
  if (!isSignupMode && (!email || !pwd)) return showToast('Enter email and password');
  if (!isValidEmailFormat(email)) return showToast('Please enter a valid email address');
  if (isSignupMode && isDisposableEmail(email)) return showToast('Temporary/disposable emails are not allowed.');
  const btn = document.getElementById('authActionBtn');
  btn.textContent = "Please wait..."; btn.disabled = true;
  try {
    if (isSignupMode) {
      const cred = await firebase.auth().createUserWithEmailAndPassword(email, pwd);
      await cred.user.updateProfile({ displayName: username });
      if (db) await db.collection("cineq_users").doc(cred.user.uid).set({ username, email, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      await cred.user.sendEmailVerification();
      showToast("Account created! Check your email to verify.");
    } else {
      await firebase.auth().signInWithEmailAndPassword(email, pwd);
    }
  } catch (e) {
    const code = e.code || '';
    if (!isSignupMode && (code === 'auth/user-not-found' || code === 'auth/invalid-credential')) {
      try {
        const methods = await firebase.auth().fetchSignInMethodsForEmail(email);
        if (methods.length === 0) {
          isSignupMode = true;
          document.getElementById('authTitle').textContent = "Create Account";
          document.getElementById('authActionBtn').textContent = "Sign Up";
          document.getElementById('authFooterText').textContent = "Already have an account?";
          document.getElementById('authToggleBtn').textContent = "Sign in";
          document.getElementById('authUsernameGroup').style.display = "block";
          showToast("No account found - sign up instead!");
        } else { showToast("Incorrect password. Try again."); }
      } catch (_) { showToast(friendlyAuthError(code)); }
    } else { showToast(friendlyAuthError(code)); }
  } finally {
    btn.disabled = false;
    btn.textContent = isSignupMode ? "Sign Up" : "Sign In";
  }
}

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found': 'No account with that email',
    'auth/wrong-password': 'Incorrect password',
    'auth/invalid-credential': 'Invalid email or password',
    'auth/email-already-in-use': 'Email already registered - try signing in',
    'auth/weak-password': 'Password must be at least 6 characters',
    'auth/invalid-email': 'Please enter a valid email address',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment',
    'auth/network-request-failed': 'Network error. Check your connection',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

async function forgotPassword() {
  const email = document.getElementById('authEmail').value.trim();
  if (!email) return showToast('Enter your email first, then click Forgot Password');
  try {
    await firebase.auth().sendPasswordResetEmail(email);
    showToast('Password reset email sent! Check your inbox.');
  } catch (e) { showToast(friendlyAuthError(e.code || '')); }
}

function logout() { firebase.auth().signOut(); }

// ===== WATCHLIST LOAD =====
async function loadWatchlist() {
  if (!db || !currentUser) return;
  try {
    const docSnap = await db.collection("cineq_watchlists").doc(currentUser.uid).get();
    if (docSnap.exists) {
      const data = docSnap.data();
      watchlist = data.items || [];
      notifications = data.notifications || [];
      if (data.epCache) { epCache = { ...epCache, ...data.epCache }; saveEpCache(); }
      if (data.randomPickState) {
        const todayStr = todayDate();
        if (data.randomPickState.date === todayStr) localStorage.setItem('cineq_random_pick_state', JSON.stringify(data.randomPickState));
      }
    } else { watchlist = []; notifications = []; }
    renderGrid();
    renderNotifications();
  } catch (e) { console.error("Error loading watchlist", e); }
}

// ===== STATE =====
let watchlist = [];
let currentFilter = 'list'; // list, watching, watched, explore, archive
let currentSort = 'added'; // added, name, rating, year
let currentSortOrder = 'desc'; // desc, asc
let advFilters = { type: 'all', year: 'all', length: 'all' };
let deleteMode = false;
let selectedForDelete = new Set();
let flowModeActive = false;
let searchTimeout;
let lastQuery = '';
let recentlyDeletedItems = [];
let notifications = [];
let exploreLoaded = false;
let currentModalTitle = null;
let currentModalMediaType = 'movie';

// ===== EPISODE COUNT CACHE =====
let epCache = {};
let epCacheKey = 'cineq_ep_cache';

function loadEpCacheForUser(uid) {
  epCacheKey = `cineq_ep_cache_${uid}`;
  try { const raw = localStorage.getItem(epCacheKey); epCache = raw ? JSON.parse(raw) : {}; } catch(e) { epCache = {}; }
}
function saveEpCache() {
  try { localStorage.setItem(epCacheKey, JSON.stringify(epCache)); } catch(e) {}
}
function epDisplay(item) {
  if (item.media_type !== 'tv') return null;
  const cached = epCache[String(item.id)];
  if (cached) return cached;
  if (item.episodes) return item.episodes;
  return '?';
}

// ===== GOOGLE CALENDAR =====
const CAL_CLIENT_ID = '509204660972-3774jpvhcginocobddqkn3pmv8ngnf51.apps.googleusercontent.com';
const CAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
let gapiInited = false, gisInited = false, tokenClient = null, currentScheduleTitle = null;

function gapiLoaded() {
  gapi.load('client', async () => {
    await gapi.client.init({ discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'] });
    gapiInited = true;
  });
}
function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CAL_CLIENT_ID, scope: CAL_SCOPE,
    callback: (resp) => { if (!resp.error) { gapi.client.setToken({ access_token: resp.access_token }); submitCalendarEvent(); } }
  });
  gisInited = true;
}

// ===== SORT PANEL =====
const SORT_OPTIONS = [
  { key: 'added',  label: 'Date Added', canOrder: true },
  { key: 'name',   label: 'Name',       canOrder: true },
  { key: 'rating', label: 'Rating',     canOrder: true },
  { key: 'year',   label: 'Year',       canOrder: true },
];

function toggleSortPanel() {
  const panel = document.getElementById('sortPanel');
  const backdrop = document.getElementById('sortPanelBackdrop');
  const btn = document.getElementById('sortFilterBtn');
  if (panel.style.display === 'none' || panel.style.display === '') {
    panel.style.display = 'block';
    backdrop.style.display = 'block';
    if (btn) btn.classList.add('active');
    renderSortPills();
    setTimeout(() => panel.classList.add('open'), 10);
  } else {
    panel.classList.remove('open');
    if (btn) btn.classList.remove('active');
    setTimeout(() => {
      panel.style.display = 'none';
      backdrop.style.display = 'none';
    }, 300);
  }
}

function toggleAdvancedFilter() {
  const panel = document.getElementById('advFilterPanel');
  const backdrop = document.getElementById('advFilterBackdrop');
  if (panel.style.display === 'none' || panel.style.display === '') {
    panel.style.display = 'block';
    backdrop.style.display = 'block';
    setTimeout(() => panel.classList.add('open'), 10);
  } else {
    panel.classList.remove('open');
    setTimeout(() => {
      panel.style.display = 'none';
      backdrop.style.display = 'none';
    }, 300);
  }
}

function setAdvFilter(category, value, btn) {
  advFilters[category] = value;
  const parent = btn.parentElement;
  parent.querySelectorAll('.sort-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGrid();
}

function renderSortPills() {
  const container = document.getElementById('sortPills');
  const flowBtn = document.getElementById('flowModeBtn');
  if (flowBtn) {
    flowBtn.classList.toggle('active', flowModeActive);
    flowBtn.classList.toggle('is-selected', flowModeActive);
    flowBtn.style.display = (currentFilter === 'list' || currentFilter === 'watching') ? '' : 'none';
  }
  container.innerHTML = SORT_OPTIONS.map(opt => {
    const isActive = !flowModeActive && currentSort === opt.key;
    const arrow = currentSortOrder === 'asc' ? '↑' : '↓';
    return `<button class="sort-pill ${isActive ? 'active' : ''}" onclick="setSortFromPanel('${opt.key}')">
      ${opt.label}
      ${isActive && opt.canOrder ? `<span class="pill-arrow" onclick="toggleSortOrder(event)">${arrow}</span>` : ''}
    </button>`;
  }).join('');
}

function setSortFromPanel(key) {
  flowModeActive = false;
  if (currentSort === key) currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
  else { currentSort = key; currentSortOrder = 'desc'; }
  renderSortPills();
  renderGrid();
}

function toggleSortOrder(e) {
  e.stopPropagation();
  currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
  renderSortPills();
  renderGrid();
}

async function activateFlowMode() {
  if (currentFilter === 'watched') return;
  flowModeActive = true;
  currentSort = 'flowmode';
  toggleSortPanel();
  const overlay = document.getElementById('flowmodeOverlay');
  const statusEl = document.getElementById('flowmodeStatus');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  const phases = ['Scanning your list...', 'Fetching genre data...', 'Analysing flow patterns...', 'Optimising your order...'];
  let pi = 0;
  statusEl.textContent = phases[0];
  const phaseTimer = setInterval(() => { pi++; if (pi < phases.length) statusEl.textContent = phases[pi]; }, 900);
  try {
    const unwatched = watchlist.filter(w => !w.watched);
    const toFetch = unwatched.filter(w => !w._genres).slice(0, 15);
    await Promise.allSettled(toFetch.map(async item => {
      try {
        const endpoint = item.media_type === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`;
        const res = await tmdbFetch(endpoint);
        const data = await res.json();
        item._genres = (data.genres || []).map(g => g.name);
        item._aniScore = (data.vote_average || 0) * 10;
        if (item.media_type === 'tv' && data.number_of_episodes) item.episodes = data.number_of_episodes;
      } catch(e) {}
    }));
  } catch(e) {}
  await new Promise(r => setTimeout(r, 3500));
  clearInterval(phaseTimer);
  overlay.style.display = 'none';
  document.body.style.overflow = '';
  renderSortPills();
  renderGrid();
  showToast('FlowMode active - your optimised order is ready');
}

function applyFlowMode(items) {
  const withPriority = items.map(a => ({
    ...a,
    _score: (a._aniScore || (a.score ? a.score * 10 : 0)),
    _inProgress: (a.episodesWatched || 0) > 0 ? 1 : 0
  }));
  const movies = withPriority.filter(a => a.media_type === 'movie').sort((a,b) => b._score - a._score);
  const short  = withPriority.filter(a => a.media_type === 'tv' && (a.episodes||999) <= 20).sort((a,b) => b._inProgress-a._inProgress || b._score-a._score);
  const medium = withPriority.filter(a => a.media_type === 'tv' && (a.episodes||999) > 20 && (a.episodes||999) <= 100).sort((a,b) => b._inProgress-a._inProgress || b._score-a._score);
  const long   = withPriority.filter(a => a.media_type === 'tv' && (a.episodes||999) > 100).sort((a,b) => b._inProgress-a._inProgress || b._score-a._score);
  const result = []; let mi = 0;
  const maxLen = Math.max(short.length, medium.length, long.length);
  for (let i = 0; i < maxLen; i++) {
    if (short[i])  result.push(short[i]);
    if (medium[i]) result.push(medium[i]);
    if (i % 2 === 1 && movies[mi]) { result.push(movies[mi++]); }
    if (long[i])   result.push(long[i]);
  }
  while (mi < movies.length) result.push(movies[mi++]);
  const seen = new Set();
  return result.filter(a => seen.has(a.id) ? false : seen.add(a.id));
}

// ===== LIGHTBOX =====
function openLightbox(src) {
  const lb = document.getElementById('lightboxBackdrop');
  const img = document.getElementById('lightboxImg');
  img.src = src;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
  lucide.createIcons();
}
function closeLightbox() {
  document.getElementById('lightboxBackdrop').classList.remove('open');
  if (!document.getElementById('modalBackdrop').classList.contains('open')) document.body.style.overflow = '';
}

// ===== SEARCH =====
const searchInput = document.getElementById('searchInput');
const dropdown = document.getElementById('dropdown');
const searchStatus = document.getElementById('searchStatus');
const headerSearchClear = document.getElementById('headerSearchClear');

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  clearTimeout(searchTimeout);
  if (headerSearchClear) headerSearchClear.style.display = q.length ? '' : 'none';
  if (q.length < 2) { closeDropdown(); searchStatus.textContent = ''; return; }
  searchStatus.textContent = 'Searching...';
  searchTimeout = setTimeout(() => fetchSearch(q), 450);
});

searchInput.addEventListener('focus', () => {
  if (dropdown.innerHTML && lastQuery === searchInput.value.trim()) openDropdown();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.header-search-wrap')) closeDropdown();
});

function clearSearch() {
  searchInput.value = '';
  dropdown.innerHTML = '';
  searchStatus.textContent = '';
  if (headerSearchClear) headerSearchClear.style.display = 'none';
  closeDropdown();
  searchInput.focus();
}

async function fetchSearch(q) {
  lastQuery = q;
  try {
    const adult = userSettings.sfwFilter ? 'false' : 'true';
    const res = await tmdbFetch(`/search/multi?query=${encodeURIComponent(q)}&include_adult=${adult}&language=en-US&page=1`);
    const data = await res.json();
    if (q !== lastQuery) return;
    const results = (data.results || []).filter(r => r.media_type !== 'person' && r.poster_path);
    renderDropdown(results);
    searchStatus.textContent = '';
  } catch (e) { searchStatus.textContent = 'Error fetching results'; }
}

let lastSearchResults = [];

function renderDropdown(results) {
  if (!results.length) {
    dropdown.innerHTML = `<div class="drop-empty">No results found</div>`;
    openDropdown(); return;
  }
  lastSearchResults = results;
  dropdown.innerHTML = results.slice(0, 8).map((a, idx) => {
    const title = getTitle(a);
    const year = getYear(a) || '-';
    const mediaType = a.media_type || 'movie';
    const typeLabel = mediaType === 'tv' ? 'TV' : 'Movie';
    const typeClass = mediaType === 'tv' ? 'tv' : 'movie';
    const inList = watchlist.some(w => w.id === a.id && w.media_type === mediaType);
    return `
    <div class="drop-item" data-idx="${idx}" data-id="${a.id}" data-type="${mediaType}">
      <img class="drop-poster" src="${escHtml(getPosterUrl(a.poster_path))}" alt="" onerror="this.style.background='#222';this.src=''" draggable="false" oncontextmenu="return false"/>
      <div class="drop-info">
        <div class="drop-title">${escHtml(title)}</div>
        <div class="drop-meta"><span class="drop-type-badge ${typeClass}">${typeLabel}</span>${escHtml(year)} · ★ ${a.vote_average ? a.vote_average.toFixed(1) : 'N/A'}</div>
      </div>
      <button class="drop-add ${inList ? 'added' : ''}" data-idx="${idx}" ${inList ? 'disabled' : ''}>
        ${inList ? 'Added' : '+ Add'}
      </button>
    </div>`;
  }).join('');

  dropdown.querySelectorAll('.drop-item').forEach(item => {
    const idx = parseInt(item.dataset.idx);
    const clickable = [item.querySelector('.drop-poster'), item.querySelector('.drop-title')];
    clickable.forEach(el => {
      if (el) el.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = lastSearchResults[idx];
        if (r) openModal(r.id, r.media_type || 'movie', null);
      });
    });
  });

  dropdown.querySelectorAll('.drop-add:not(.added)').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const r = lastSearchResults[idx];
      if (r) addTitle(r.id, r, btn, r.media_type || 'movie');
    });
  });

  openDropdown();
}

function openDropdown()  { dropdown.classList.add('open'); }
function closeDropdown() { dropdown.classList.remove('open'); }

function addTitleFromModal(btn) {
  if (currentModalTitle) addTitle(currentModalTitle.id, currentModalTitle, btn, currentModalMediaType);
}

// ===== ADD TITLE =====
function addTitle(id, itemData, btn, mediaType) {
  const type = mediaType || itemData.media_type || 'movie';
  if (watchlist.some(w => w.id === id && w.media_type === type)) return;
  const title = getTitle(itemData);
  const year = getYear(itemData);
  const poster = getPosterUrl(itemData.poster_path);
  const item = {
    id: itemData.id,
    media_type: type,
    title,
    poster,
    year: year ? parseInt(year) : null,
    score: itemData.vote_average || null,
    episodes: type === 'tv' ? (itemData.number_of_episodes || null) : null,
    runtime: type === 'movie' ? (itemData.runtime || null) : null,
    status: itemData.status || null,
    studio: (itemData.production_companies || [])[0]?.name || null,
    watched: false,
    episodesWatched: 0,
    addedAt: Date.now()
  };
  watchlist.push(item);
  save().then(() => {
    if (btn) { btn.textContent = 'Added'; btn.classList.add('added'); btn.disabled = true; }
    showToast(`"${item.title}" added to watchlist`);
  });
  renderGrid();
}

// ===== REMOVE =====
function removeTitle(id, mediaType, event) {
  if (event) event.stopPropagation();
  const index = watchlist.findIndex(w => w.id === id && w.media_type === mediaType);
  if (index !== -1) {
    recentlyDeletedItems = [watchlist[index]];
    watchlist.splice(index, 1);
    save();
    renderGrid();
    showToast(`Removed "${recentlyDeletedItems[0].title}"`, true);
  }
}

// ===== TOGGLE WATCHED =====
async function toggleWatched(id, mediaType, event) {
  if (event) event.stopPropagation();
  const item = watchlist.find(w => w.id === id && w.media_type === mediaType);
  if (!item) return;
  item.watched = !item.watched;
  if (item.watched) {
    if (item.episodes) item.episodesWatched = item.episodes;
    item.watchedAt = todayDate();
  } else {
    item.episodesWatched = 0;
    item.watchedAt = null;
  }
  await save();
  renderGrid();
}

async function toggleCustomList(id, mediaType, event) {
  if (event) event.stopPropagation();
  const item = watchlist.find(w => w.id === id && w.media_type === mediaType);
  if (!item) return;
  item.inCustomList = !item.inCustomList;
  await save();
  renderGrid();
  // re-render modal
  const modal = document.getElementById('modalBackdrop');
  if (modal.classList.contains('open')) openModal(id, mediaType);
}

function todayDate() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`;
}

// ===== SAVE =====
async function save() {
  updateStats();
  if (!db || !currentUser) return;
  try {
    let randomPickState = null;
    try { const stored = localStorage.getItem('cineq_random_pick_state'); if (stored) randomPickState = JSON.parse(stored); } catch(e) {}
    await db.collection("cineq_watchlists").doc(currentUser.uid).set({ items: watchlist, epCache, randomPickState, notifications });
  } catch (e) { console.error("Error saving watchlist", e); showToast("Failed to sync to database"); }
}

// ===== STATS =====
function updateStats() {
  const total = watchlist.length;
  const watched = watchlist.filter(w => w.watched).length;
  const totalElem = document.getElementById('totalCount');
  if (totalElem) totalElem.textContent = total;
  const watchedElem = document.getElementById('watchedCount');
  if (watchedElem) watchedElem.textContent = watched;
  const remainElem = document.getElementById('remainCount');
  if (remainElem) remainElem.textContent = total - watched;
  
  // Calculate Watch Time & Insights
  let totalMinutes = 0;
  let moviesCount = 0;
  let tvCount = 0;
  
  watchlist.forEach(item => {
    if (item.media_type === 'movie') {
      moviesCount++;
      if (item.watched && item.runtime) totalMinutes += item.runtime;
    } else {
      tvCount++;
      if (item.episodesWatched > 0) {
        // Assume 45 mins average runtime per episode if not provided natively
        const epRuntime = item.runtime || 45;
        totalMinutes += item.episodesWatched * epRuntime;
      }
    }
  });
  
  const compRate = total > 0 ? Math.round((watched / total) * 100) : 0;
  const compEl = document.getElementById('statsCompletion');
  if (compEl) compEl.textContent = compRate + '%';
  
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const timeEl = document.getElementById('statsTotalTime');
  if (timeEl) timeEl.textContent = `${days}d ${hours}h`;
  
  const totalMedia = moviesCount + tvCount;
  const moviePct = totalMedia > 0 ? Math.round((moviesCount / totalMedia) * 100) : 50;
  const tvPct = totalMedia > 0 ? 100 - moviePct : 50;
  
  const pc = document.getElementById('statsPieMovie');
  if (pc) pc.setAttribute('stroke-dasharray', `${(moviePct / 100) * 100.5} 100.5`);
  const mp = document.getElementById('statsMoviePct');
  if (mp) mp.textContent = moviePct + '%';
  const tp = document.getElementById('statsTvPct');
  if (tp) tp.textContent = tvPct + '%';
}

function shareStats() {
  const node = document.getElementById('statsExportArea');
  if (!node) return;
  showToast("Generating image...");
  html2canvas(node, {
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    scale: 2
  }).then(canvas => {
    const link = document.createElement('a');
    link.download = 'cineq-stats.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }).catch(err => {
    console.error("Export error", err);
    showToast("Failed to export image");
  });
}

function toggleSearch() {}

function toggleProfileMenu() {
  const menu = document.getElementById('profileMenu');
  const notifMenu = document.getElementById('notifMenu');
  if (notifMenu) notifMenu.style.display = 'none';
  menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
}

function toggleNotifMenu() {
  const menu = document.getElementById('notifMenu');
  const profileMenu = document.getElementById('profileMenu');
  if (profileMenu) profileMenu.style.display = 'none';
  menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
}

document.addEventListener('click', (e) => {
  const profileMenu = document.getElementById('profileMenu');
  const avatarBtn = document.getElementById('avatarBtn');
  if (profileMenu && profileMenu.style.display !== 'none' && !profileMenu.contains(e.target) && !avatarBtn.contains(e.target)) {
    profileMenu.style.display = 'none';
  }
  
  const notifMenu = document.getElementById('notifMenu');
  const notifBtn = document.getElementById('notifBtn');
  if (notifMenu && notifMenu.style.display !== 'none' && !notifMenu.contains(e.target) && !notifBtn.contains(e.target)) {
    notifMenu.style.display = 'none';
  }
});

// ===== FILTER & SELECT MODE =====
function setFilter(f, btn) {
  currentFilter = f;
  if (f === 'explore') { btn.classList.remove('new'); localStorage.setItem('cineqExploreClicked', 'true'); }
  document.querySelectorAll('#normalFilters .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const gridWrap = document.getElementById('gridWrap');
  const exploreSection = document.getElementById('exploreSection');
  const sortFilterBtn = document.getElementById('sortFilterBtn');
  const selectModeToggleBtn = document.getElementById('selectModeToggleBtn');
  if (f === 'explore') {
    gridWrap.style.display = 'none';
    exploreSection.style.display = 'block';
    if (sortFilterBtn) sortFilterBtn.style.display = 'none';
    if (selectModeToggleBtn) selectModeToggleBtn.style.display = 'none';
    if (!exploreLoaded) loadExplore();
  } else {
    if (f === 'watched' && flowModeActive) { flowModeActive = false; currentSort = userSettings.defaultSort || 'added'; currentSortOrder = userSettings.defaultSortOrder || 'desc'; }
    gridWrap.style.display = 'block';
    exploreSection.style.display = 'none';
    if (sortFilterBtn) sortFilterBtn.style.display = '';
    if (selectModeToggleBtn) selectModeToggleBtn.style.display = '';
    renderGrid();
  }
}

function toggleSelectMode() {
  deleteMode = !deleteMode;
  selectedForDelete.clear();
  document.getElementById('normalFilters').style.display = deleteMode ? 'none' : 'flex';
  document.getElementById('selectFilters').style.display = deleteMode ? 'flex' : 'none';
  renderGrid();
  updateSelectUI();
}

function updateSelectUI() {
  const countText = document.getElementById('selectCountText');
  if (countText) countText.textContent = `${selectedForDelete.size} Selected`;
  const bulkBtn = document.querySelector('.sel-watched');
  if (bulkBtn) {
    if (currentFilter === 'watched') {
      bulkBtn.innerHTML = `<i data-lucide="eye-off" style="width:15px;height:15px;"></i> Unwatch`;
      bulkBtn.setAttribute('onclick', 'markSelectedUnwatched()');
    } else {
      bulkBtn.innerHTML = `<i data-lucide="check-circle" style="width:15px;height:15px;"></i> Watched`;
      bulkBtn.setAttribute('onclick', 'markSelectedWatched()');
    }
    if (window.lucide) lucide.createIcons();
  }
}

function toggleSelection(id) {
  if (selectedForDelete.has(id)) selectedForDelete.delete(id);
  else selectedForDelete.add(id);
  updateSelectUI();
  const card = document.getElementById(`card-${id}`);
  if (card) card.classList.toggle('selected', selectedForDelete.has(id));
}

function confirmRemoveSelected() {
  if (selectedForDelete.size === 0) { toggleSelectMode(); return; }
  const count = selectedForDelete.size;
  if (!confirm(`Remove ${count} title(s) from your watchlist?\n\nThis action cannot be undone.`)) return;
  recentlyDeletedItems = watchlist.filter(w => selectedForDelete.has(w.id));
  watchlist = watchlist.filter(w => !selectedForDelete.has(w.id));
  save();
  toggleSelectMode();
  showToast(`Removed ${recentlyDeletedItems.length} title(s)`, true);
}

async function markSelectedWatched() {
  if (selectedForDelete.size === 0) { toggleSelectMode(); return; }
  const date = todayDate();
  selectedForDelete.forEach(id => {
    const item = watchlist.find(w => w.id === id);
    if (item) { item.watched = true; if (item.episodes) item.episodesWatched = item.episodes; item.watchedAt = date; }
  });
  const count = selectedForDelete.size;
  await save();
  toggleSelectMode();
  showToast(`Marked ${count} title(s) as watched ✓`);
}

async function markSelectedUnwatched() {
  if (selectedForDelete.size === 0) { toggleSelectMode(); return; }
  selectedForDelete.forEach(id => {
    const item = watchlist.find(w => w.id === id);
    if (item) { item.watched = false; item.episodesWatched = 0; item.watchedAt = null; }
  });
  const count = selectedForDelete.size;
  await save();
  toggleSelectMode();
  showToast(`Marked ${count} title(s) as unwatched`);
}

// ===== RENDER GRID =====
function renderGrid() {
  const grid = document.getElementById('grid');
  const empty = document.getElementById('emptyState');
  updateStats();

  let baseItems = [...watchlist];
  if (currentFilter === 'watched')  baseItems = baseItems.filter(w => w.watched && !w.archived);
  else if (currentFilter === 'watching') baseItems = baseItems.filter(w => !w.watched && !w.archived && w.media_type === 'tv' && (w.episodesWatched || 0) > 0);
  else if (currentFilter === 'archive') baseItems = baseItems.filter(w => w.archived);
  else if (currentFilter === 'custom') baseItems = baseItems.filter(w => w.inCustomList);
  else baseItems = baseItems.filter(w => !w.watched && !w.archived);

  let items = [...baseItems];

  // Apply Advanced Filters
  if (advFilters.type !== 'all') {
    items = items.filter(w => w.media_type === advFilters.type);
  }
  if (advFilters.year !== 'all') {
    items = items.filter(w => {
      const y = parseInt(w.year || (w.release_date || '').substring(0,4) || (w.first_air_date || '').substring(0,4));
      if (!y) return false;
      if (advFilters.year === '2020s') return y >= 2020 && y < 2030;
      if (advFilters.year === '2010s') return y >= 2010 && y < 2020;
      if (advFilters.year === '2000s') return y >= 2000 && y < 2010;
      if (advFilters.year === '90s') return y >= 1990 && y < 2000;
      if (advFilters.year === '80s') return y >= 1980 && y < 1990;
      if (advFilters.year === 'older') return y < 1980;
      return true;
    });
  }
  if (advFilters.length !== 'all') {
    items = items.filter(w => {
      if (w.media_type !== 'movie') return true;
      const r = w.runtime || 0;
      if (!r) return true; // skip if no runtime
      if (advFilters.length === 'short') return r < 90;
      if (advFilters.length === 'medium') return r >= 90 && r <= 120;
      if (advFilters.length === 'long') return r > 120;
      return true;
    });
  }

  const showEpCounter = (currentFilter === 'watching');

  const sortFilterBtn = document.getElementById('sortFilterBtn');
  const selectModeToggleBtn = document.getElementById('selectModeToggleBtn');
  const hasAdvFilter = advFilters.type !== 'all' || advFilters.year !== 'all' || advFilters.length !== 'all';
  if (sortFilterBtn) sortFilterBtn.style.display = (baseItems.length <= 1 && !hasAdvFilter && !flowModeActive) ? 'none' : '';
  if (selectModeToggleBtn) selectModeToggleBtn.style.display = items.length === 0 ? 'none' : '';

  if (flowModeActive) {
    items = applyFlowMode(items);
  } else {
    const asc = currentSortOrder === 'asc';
    if (currentSort === 'rating')   items.sort((a,b) => asc ? (a.score||0)-(b.score||0) : (b.score||0)-(a.score||0));
    else if (currentSort === 'name') items.sort((a,b) => asc ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title));
    else if (currentSort === 'year') items.sort((a,b) => asc ? (a.year||0)-(b.year||0) : (b.year||0)-(a.year||0));
    else { if (!asc) items.reverse(); }
  }

  if (items.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    const emptyTitle = empty.querySelector('p');
    const emptySub = empty.querySelector('small');
    if (emptyTitle && emptySub) {
      if (currentFilter === 'watched') { emptyTitle.textContent = "You haven't completed anything yet"; emptySub.textContent = "Mark titles as watched to see them here"; }
      else if (currentFilter === 'watching') { emptyTitle.textContent = "No TV series currently in progress"; emptySub.textContent = "Update episodes watched to track your progress"; }
      else if (currentFilter === 'archive') { emptyTitle.textContent = "No dropped titles"; emptySub.textContent = "Titles you drop will appear here"; }
      else { emptyTitle.textContent = "Your watchlist is empty"; emptySub.textContent = "Search movies & TV series to get started"; }
    }
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = items.map((a, i) => {
    const isTV = a.media_type === 'tv';
    const typePill = isTV
      ? `<span class="type-pill tv-pill">TV</span>`
      : `<span class="type-pill">Movie</span>`;
    const epCount = isTV ? epDisplay(a) : null;
    return `
    <div class="card-wrapper">
      <article class="card ${a.watched ? 'watched' : ''} ${deleteMode ? 'delete-mode' : ''} ${selectedForDelete.has(a.id) ? 'selected' : ''}" id="card-${a.id}" onclick="openModal(${a.id}, '${a.media_type}', event)">
        <img class="poster-img" src="${a.poster || ''}" alt="${escHtml(a.title)}" loading="lazy" onerror="this.src=''" draggable="false" oncontextmenu="return false" />
        <div class="card-gradient"></div>
        <div class="card-select-overlay"></div>
        ${!a.watched ? `
        <button class="watched-btn ${a.watched ? 'checked' : ''}" onclick="toggleWatched(${a.id}, '${a.media_type}', event)" title="Mark watched">
          <i data-lucide="check" style="width:14px;height:14px;stroke-width:3;"></i>
        </button>` : ''}
        ${currentFilter !== 'watched' ? `<button class="remove-btn" onclick="removeTitle(${a.id}, '${a.media_type}', event)" title="Remove"><i data-lucide="trash-2" style="width:13px;height:13px;"></i></button>` : ''}
        <div class="card-content">
          <div class="card-meta">${typePill}</div>
          <h3 class="card-title">${escHtml(a.title)}</h3>
          ${showEpCounter && isTV ? `<div class="card-ep-counter" onclick="event.stopPropagation()">
            <button class="ep-btn" onmousedown="startProgress(${a.id},-1,event)" onmouseup="stopProgress(event)" onmouseleave="stopProgress(event)" ontouchstart="startProgress(${a.id},-1,event)" ontouchend="stopProgress(event)">−</button>
            <span class="ep-text" id="ep-text-${a.id}">Ep ${a.episodesWatched||0}/${epCount || '?'}</span>
            <button class="ep-btn" onmousedown="startProgress(${a.id},1,event)" onmouseup="stopProgress(event)" onmouseleave="stopProgress(event)" ontouchstart="startProgress(${a.id},1,event)" ontouchend="stopProgress(event)">+</button>
          </div>` : ''}
        </div>
      </article>
      ${!deleteMode ? `<div class="card-sl">${i + 1}</div>` : ''}
    </div>`;
  }).join('');
  lucide.createIcons();
}

// ===== MODAL =====
async function openModal(id, mediaType, event) {
  if (deleteMode) {
    if (event) event.preventDefault();
    toggleSelection(id);
    return;
  }
  document.body.style.overflow = 'hidden';
  const backdrop = document.getElementById('modalBackdrop');
  const content = document.getElementById('modalContent');
  backdrop.classList.add('open');
  content.innerHTML = `<div class="modal-loading"><img src="assets/images/blocks_shuffle_loading.svg" alt="Loading..." class="blocks-loading" />Loading details…</div>`;

  const wlItem = watchlist.find(w => w.id === id);
  const type = mediaType || wlItem?.media_type || 'movie';

  try {
    const endpoint = type === 'tv'
      ? `/tv/${id}?append_to_response=credits`
      : `/movie/${id}?append_to_response=credits,belongs_to_collection`;

    const res = await tmdbFetch(endpoint);
    const detail = await res.json();
    currentModalTitle = detail;
    currentModalMediaType = type;

    // Update ep cache for TV
    if (type === 'tv' && detail.number_of_episodes) {
      const key = String(id);
      if (!epCache[key] || epCache[key] !== detail.number_of_episodes) {
        epCache[key] = detail.number_of_episodes;
        saveEpCache();
        if (wlItem) {
          wlItem.episodes = detail.number_of_episodes;
          // If the show was marked as watched but now has more episodes, move it to watching
          if (wlItem.watched && (wlItem.episodesWatched || 0) < detail.number_of_episodes) {
            wlItem.watched = false;
            showToast(`New episodes available for ${getTitle(detail)}! Moved to Watching.`);
          }
        }
        save();
        const epText = document.getElementById(`ep-text-${id}`);
        if (epText) epText.textContent = `Ep ${wlItem ? (wlItem.episodesWatched || 0) : 0}/${detail.number_of_episodes}`;
      }
    }

    const title = getTitle(detail);
    const origTitle = type === 'tv' ? detail.original_name : detail.original_title;
    const year = type === 'tv'
      ? (detail.first_air_date ? detail.first_air_date.split('-')[0] : '-')
      : (detail.release_date ? detail.release_date.split('-')[0] : '-');

    const credits = detail.credits || {};
    const director = type === 'movie' ? (credits.crew || []).find(c => c.job === 'Director') : null;
    const creators = type === 'tv' ? (detail.created_by || []) : [];
    const topCast = (credits.cast || []).slice(0, 3).map(c => c.name).join(', ') || '-';

    let syn = detail.overview || 'No synopsis available.';
    syn = escHtml(syn);

    const existingItem = watchlist.find(w => w.id === id && w.media_type === type);
    const inList = !!existingItem;

    // Collection / watch order
    let collectionOrder = [];
    if (type === 'movie' && detail.belongs_to_collection) {
      collectionOrder = await buildCollectionOrder(detail.belongs_to_collection.id, detail);
    }

    const typeLabel = type === 'tv' ? 'TV Series' : 'Movie';
    const typeTagClass = type === 'tv' ? 'tv-accent' : 'accent';

    const isUpcoming = detail.status === 'Planned' || detail.status === 'In Production' || detail.status === 'Post Production' || (detail.release_date && new Date(detail.release_date) > new Date()) || (detail.first_air_date && new Date(detail.first_air_date) > new Date());
    const isOngoing = detail.status === 'Returning Series';
    const showNotify = isUpcoming || isOngoing;

    content.innerHTML = `
      <div class="modal-hero">
        <div class="modal-poster">
          <img src="${escHtml(getPosterUrl(detail.poster_path, true))}" alt="" onerror="this.src=''" draggable="false" oncontextmenu="return false" />
          <button class="modal-poster-expand" onclick="openLightbox('${escHtml(getPosterUrl(detail.poster_path, true))}')" title="View poster">
            <i data-lucide="maximize-2"></i>
          </button>
        </div>
        <div class="modal-hero-info">
          ${detail.vote_average ? `<div class="modal-score">★ ${detail.vote_average.toFixed(1)}</div>` : ''}
          <div class="modal-title">${escHtml(title)}</div>
          ${origTitle && origTitle !== title ? `<div class="modal-eng-title">${escHtml(origTitle)}</div>` : '<div class="modal-eng-title"></div>'}
          <div class="modal-tags">
            <span class="tag ${typeTagClass}">${typeLabel}</span>
            ${detail.status ? `<span class="tag">${detail.status}</span>` : ''}
            ${(detail.genres || []).slice(0, 3).map(g => `<span class="tag">${g.name}</span>`).join('')}
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
            ${inList && existingItem.archived ? `<div style="font-size:11px;color:var(--accent);">Dropped at: ${escHtml(existingItem.archiveTime) || 'Unknown'}</div>` : (inList ? `<div style="font-size:11px;color:var(--muted);">In list</div>` : '')}
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${!inList ? `<button class="modal-add-btn" onclick="addTitleFromModal(this)">+ Add</button>` : ''}
              ${(!existingItem?.watched && !existingItem?.archived) ? `<button class="modal-watched-btn" onclick="markWatchedFromModal(${detail.id}, '${type}')"><i data-lucide="eye" style="width:12px;height:12px;"></i> Mark Watched</button>` : ''}
              ${(inList && !existingItem.archived && !existingItem.watched) ? `<button class="modal-watched-btn" style="background:transparent;border:1px solid var(--border);color:var(--muted);" onclick="promptArchive(${detail.id}, '${type}')"><i data-lucide="archive" style="width:12px;height:12px;"></i> Drop</button>` : ''}
              ${(inList && existingItem.archived) ? `<button class="modal-watched-btn" style="background:transparent;border:1px solid var(--border);color:var(--text);" onclick="unarchive(${detail.id}, '${type}')"><i data-lucide="corner-up-left" style="width:12px;height:12px;"></i> Restore</button>` : ''}
              ${(inList && userSettings.customList?.name) ? `<button class="modal-watched-btn" style="background:transparent;border:1px solid var(--accent);color:var(--accent);" onclick="toggleCustomList(${detail.id}, '${type}', event)"><i data-lucide="${existingItem.inCustomList ? 'check' : 'plus'}" style="width:12px;height:12px;"></i> ${existingItem.inCustomList ? 'In ' : 'Add to '}${escHtml(userSettings.customList.name)}</button>` : ''}
              <button class="modal-cal-btn" onclick="openSchedule(${detail.id})"><i data-lucide="calendar" style="width:12px;height:12px;"></i> Schedule</button>
              ${showNotify ? (notifications.some(n => n.id === detail.id && n.mediaType === type) ? `<button class="modal-cal-btn" style="background:rgba(239,68,68,1);color:#fff;border-color:transparent;" onclick="toggleNotify(${detail.id}, '${type}', '${escHtml(title).replace(/'/g,"\\'")}'); event.stopPropagation();"><i data-lucide="bell-off" style="width:12px;height:12px;"></i> Cancel Notify</button>` : `<button class="modal-cal-btn" style="background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.2);" onclick="toggleNotify(${detail.id}, '${type}', '${escHtml(title).replace(/'/g,"\\'")}'); event.stopPropagation();"><i data-lucide="bell" style="width:12px;height:12px;"></i> Notify Me</button>`) : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="modal-body">
        <div class="detail-grid">
          <div class="detail-item">
            <div class="detail-label">Year</div>
            <div class="detail-val">${year}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">${type === 'tv' ? 'Seasons' : 'Runtime'}</div>
            <div class="detail-val">${type === 'tv' ? (detail.number_of_seasons ? detail.number_of_seasons + ' season' + (detail.number_of_seasons > 1 ? 's' : '') : '-') : formatRuntime(detail.runtime)}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">${type === 'tv' ? 'Episodes' : 'Studio'}</div>
            <div class="detail-val">${type === 'tv' ? (detail.number_of_episodes || '-') : ((detail.production_companies || [])[0]?.name || '-')}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">${type === 'tv' ? 'Creator' : 'Director'}</div>
            <div class="detail-val">${type === 'tv' ? (creators[0]?.name || '-') : (director?.name || '-')}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Cast</div>
            <div class="detail-val">${topCast}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Language</div>
            <div class="detail-val">${detail.original_language ? detail.original_language.toUpperCase() : '-'}</div>
          </div>
          ${type === 'tv' ? `
          <div class="detail-item">
            <div class="detail-label">Network</div>
            <div class="detail-val">${(detail.networks || [])[0]?.name || '-'}</div>
          </div>` : `
          <div class="detail-item">
            <div class="detail-label">Budget</div>
            <div class="detail-val">${detail.budget && detail.budget > 0 ? '$' + (detail.budget / 1000000).toFixed(0) + 'M' : '-'}</div>
          </div>`}
          <div class="detail-item">
            <div class="detail-label">Votes</div>
            <div class="detail-val">${detail.vote_count ? detail.vote_count.toLocaleString() : '-'}</div>
          </div>
          ${(inList && !existingItem.watched && type === 'tv') ? `
          <div style="grid-column: 1 / -1; display:flex; flex-direction:column; gap:8px;">
            <div style="background: var(--elevated); padding: 12px 16px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; border: 1px solid var(--border);">
              <div class="detail-label" style="margin: 0;">Season</div>
              <div class="progress-controls">
                <button class="progress-btn" onclick="changeSeason(${id},-1,event)">−</button>
                <span class="progress-text" id="seasonProgressTextModal">${(() => {
                  const epInfo = calculateSeasonAndEpisode(existingItem.episodesWatched, detail.seasons);
                  return \`S\${epInfo.season}\`;
                })()}</span>
                <button class="progress-btn" onclick="changeSeason(${id},1,event)">+</button>
              </div>
            </div>
            <div style="background: var(--elevated); padding: 12px 16px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; border: 1px solid var(--border);">
              <div class="detail-label" style="margin: 0;">Episodes Watched</div>
              <div class="progress-controls">
                <button class="progress-btn" onmousedown="startProgress(${id},-1,event)" onmouseup="stopProgress(event)" onmouseleave="stopProgress(event)" ontouchstart="startProgress(${id},-1,event)" ontouchend="stopProgress(event)">−</button>
                <span class="progress-text" id="epProgressTextModal">${(() => {
                  const epInfo = calculateSeasonAndEpisode(existingItem.episodesWatched, detail.seasons);
                  return \`\${epInfo.episode} / \${epInfo.seasonEpisodes || '?'}\`;
                })()}</span>
                <button class="progress-btn" onmousedown="startProgress(${id},1,event)" onmouseup="stopProgress(event)" onmouseleave="stopProgress(event)" ontouchstart="startProgress(${id},1,event)" ontouchend="stopProgress(event)">+</button>
              </div>
            </div>
          </div>` : ''}
          ${(inList && existingItem.watched) ? `
          <div style="grid-column: 1 / -1; background: var(--elevated); padding: 12px 16px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; border: 1px solid var(--border);">
            <div style="display:flex; flex-direction:column; gap:2px;">
              <span class="detail-label" style="margin: 0; color: #22c55e; display: flex; align-items: center; gap: 4px;">
                <i data-lucide="check-circle" style="width:14px;height:14px;"></i> Watched
              </span>
              <span style="font-size:11px; color:var(--muted);">Completed on ${existingItem.watchedAt || '-'}</span>
            </div>
            <button class="modal-unwatch-btn" onclick="markUnwatchedFromModal(${detail.id}, '${type}')">
              <i data-lucide="eye-off" style="width:12px;height:12px;"></i> Mark Unwatched
            </button>
          </div>` : ''}
        </div>

        <div class="section-label">Synopsis</div>
        <div class="synopsis ${syn.length < 180 ? 'expanded' : ''}" id="synopsisBox">
          ${syn}
          ${syn.length >= 180 ? '<div class="synopsis-fade"></div>' : ''}
        </div>
        ${syn.length >= 180 ? '<button class="read-more" onclick="toggleSynopsis()">Read more ↓</button>' : ''}

        ${collectionOrder.length > 1 ? `
        <div class="watch-order">
          <div class="watch-order-title">📽️ Collection Watch Order</div>
          ${collectionOrder.map((w, i) => `
            <div class="order-item">
              <div class="order-num">${i + 1}</div>
              <div class="order-name">${escHtml(w.name)}</div>
              <div class="order-type">${escHtml(w.type)}</div>
            </div>
          `).join('')}
        </div>` : ''}
      </div>
    `;
    lucide.createIcons();
  } catch (e) {
    content.innerHTML = `<div class="modal-loading" style="height:200px">Failed to load details. Try again.</div>`;
  }
}

async function buildCollectionOrder(collectionId, currentDetail) {
  try {
    const res = await tmdbFetch(`/collection/${collectionId}`);
    const data = await res.json();
    const parts = (data.parts || []).sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''));
    return parts.map(p => ({
      name: p.title || p.name,
      type: p.id === currentDetail.id ? 'Movie (Current)' : 'Movie'
    }));
  } catch(e) { return []; }
}

function toggleSynopsis() {
  const box = document.getElementById('synopsisBox');
  const btn = box.nextElementSibling;
  box.classList.toggle('expanded');
  btn.textContent = box.classList.contains('expanded') ? 'Read less ↑' : 'Read more ↓';
}

function closeModal(e) { if (e.target === document.getElementById('modalBackdrop')) closeModalDirect(); }
function closeModalDirect() {
  document.getElementById('modalBackdrop').classList.remove('open');
  if (!document.getElementById('lightboxBackdrop').classList.contains('open')) document.body.style.overflow = '';
}

async function markWatchedFromModal(id, mediaType) {
  let item = watchlist.find(w => w.id === id && w.media_type === mediaType);
  if (!item && currentModalTitle) {
    const a = currentModalTitle;
    const type = mediaType || currentModalMediaType;
    const newItem = {
      id: a.id, media_type: type, title: getTitle(a),
      poster: getPosterUrl(a.poster_path),
      year: getYear(a) ? parseInt(getYear(a)) : null,
      score: a.vote_average || null,
      episodes: type === 'tv' ? (a.number_of_episodes || null) : null,
      runtime: type === 'movie' ? (a.runtime || null) : null,
      status: a.status || null,
      studio: (a.production_companies || [])[0]?.name || null,
      watched: false, episodesWatched: 0, addedAt: Date.now()
    };
    watchlist.push(newItem);
    item = newItem;
  }
  if (item) {
    item.watched = true;
    if (item.episodes) item.episodesWatched = item.episodes;
    item.watchedAt = todayDate();
    await save();
    renderGrid();
    openModal(id, mediaType);
    showToast('Marked as watched ✓');
  }
}

async function markUnwatchedFromModal(id, mediaType) {
  const item = watchlist.find(w => w.id === id && w.media_type === mediaType);
  if (item) {
    item.watched = false;
    item.episodesWatched = 0;
    item.watchedAt = null;
    await save();
    renderGrid();
    openModal(id, mediaType);
    showToast('Marked as unwatched');
  }
}

// ===== UTILS =====
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function showToast(msg, isUndo = false) {
  const t = document.getElementById('toast');
  t.innerHTML = `<span>${escHtml(msg)}</span>` + (isUndo ? `<span onclick="undoDelete()" style="color:var(--accent);text-decoration:underline;margin-left:16px;cursor:pointer;font-weight:bold;">Undo</span>` : '');
  t.classList.add('show');
  clearTimeout(t.timeout);
  t.timeout = setTimeout(() => t.classList.remove('show'), isUndo ? 4000 : 2500);
}

function undoDelete() {
  if (recentlyDeletedItems.length > 0) {
    watchlist.push(...recentlyDeletedItems);
    save();
    renderGrid();
    recentlyDeletedItems = [];
    document.getElementById('toast').classList.remove('show');
  }
}

// ===== INIT =====
loadLocalSettings();
lucide.createIcons();
renderGrid();

// ===== USERNAME SCRAMBLE =====
(function () {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#!&*%';
  let scrambleTimer = null;
  function scramble(el) {
    if (scrambleTimer) clearInterval(scrambleTimer);
    const original = el.dataset.original || el.textContent;
    el.dataset.original = original;
    const len = original.length; let revealed = 0, frame = 0;
    scrambleTimer = setInterval(() => {
      if (frame % 2 === 0 && revealed < len) revealed++;
      el.textContent = original.split('').map((ch, i) => i < revealed ? ch : CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
      frame++;
      if (revealed >= len) { clearInterval(scrambleTimer); scrambleTimer = null; el.textContent = original; }
    }, 28);
  }
  function unscramble(el) {
    if (scrambleTimer) { clearInterval(scrambleTimer); scrambleTimer = null; }
    if (el.dataset.original) el.textContent = el.dataset.original;
  }
  document.addEventListener('mouseover', (e) => { const el = e.target.closest('.profile-username'); if (el) scramble(el); });
  document.addEventListener('mouseout',  (e) => { const el = e.target.closest('.profile-username'); if (el) unscramble(el); });
})();

// ===== EPISODE PROGRESS =====
let progressInterval = null, progressTimeout = null;
function startProgress(id, change, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  updateProgress(id, change, null, true);
  progressTimeout = setTimeout(() => {
    progressInterval = setInterval(() => { updateProgress(id, change, null, true); }, 100);
  }, 400);
}
function stopProgress(event) {
  if (event) event.stopPropagation();
  clearTimeout(progressTimeout);
  clearInterval(progressInterval);
  save();
  renderGrid();
}
async function updateProgress(id, change, event, skipSave = false) {
  if (event) event.stopPropagation();
  const item = watchlist.find(i => i.id === id && i.media_type === 'tv');
  if (!item) return;
  const wasWatched = item.watched;
  let newProgress = (item.episodesWatched || 0) + change;
  if (newProgress < 0) newProgress = 0;
  if (item.episodes && newProgress > item.episodes) newProgress = item.episodes;
  item.episodesWatched = newProgress;
  if (item.episodes) {
    if (item.episodesWatched === item.episodes) { if (!item.watched) { item.watched = true; item.watchedAt = todayDate(); } }
    else { if (item.watched) { item.watched = false; item.watchedAt = null; } }
  }
  if (!skipSave) await save();
  const epText = document.getElementById(`ep-text-${id}`);
  const epTotal = item.episodes || '?';
  if (epText) epText.textContent = `Ep ${item.episodesWatched}/${epTotal}`;
  if (wasWatched !== item.watched && !skipSave) renderGrid();
  const modal = document.getElementById('modalBackdrop');
  if (modal && modal.classList.contains('open') && currentModalTitle) {
    const textEl = document.getElementById('epProgressTextModal');
    const seasonEl = document.getElementById('seasonProgressTextModal');
    if (textEl && seasonEl) {
      const epInfo = calculateSeasonAndEpisode(item.episodesWatched, currentModalTitle.seasons);
      seasonEl.textContent = `S${epInfo.season}`;
      textEl.textContent = `${epInfo.episode} / ${epInfo.seasonEpisodes || '?'}`;
    }
  }
  updateStats();
}

// ===== ACCOUNT ACTIONS =====
function confirmDeleteAccount() {
  if (confirm("Are you sure you want to delete your account?\n\nAll your watchlist data will be permanently cleared. This cannot be undone.")) deleteAccount();
}
async function deleteAccount() {
  const user = firebase.auth().currentUser;
  if (!user) return;
  try {
    await db.collection('cineq_users').doc(user.uid).delete();
    await db.collection('cineq_watchlists').doc(user.uid).delete();
    await user.delete();
    alert("Account deleted successfully.");
    window.location.reload();
  } catch (error) {
    if (error.code === 'auth/requires-recent-login') { alert("Security requirement: Please sign out and sign back in to delete your account."); logout(); }
    else { console.error("Error deleting account", error); alert("Failed to delete account: " + error.message); }
  }
}

// ===== EXPLORE SECTION =====
function getSkeletonHTML(count, isGridItem = false) {
  let html = '';
  for (let i = 0; i < count; i++) {
    if (isGridItem) {
      html += `<div class="skeleton-card grid-skeleton"><div class="skeleton-thumbnail"></div><div class="skeleton-text title"></div><div class="skeleton-text meta"></div></div>`;
    } else {
      html += `<div class="skeleton-card"><div class="skeleton-thumbnail"></div><div class="skeleton-rank"></div><div class="skeleton-text title"></div><div class="skeleton-text meta"></div></div>`;
    }
  }
  return html;
}

async function loadExplore() {
  exploreLoaded = true;
  ['carousel-trending','carousel-movies','carousel-tv','carousel-upcoming'].forEach(cid => {
    const c = document.getElementById(cid);
    if (c) c.innerHTML = getSkeletonHTML(5);
  });
  const randomContainer = document.getElementById('randomPickGrid');
  if (randomContainer) {
    let hasCache = false;
    try { const stored = localStorage.getItem('cineq_random_pick_state'); if (stored) { const p = JSON.parse(stored); if (p.date === todayDate() && p.items?.length === 3) hasCache = true; } } catch(e) {}
    if (!hasCache) randomContainer.innerHTML = getSkeletonHTML(3, true);
  }
  await fetchRandomTitle();
  await fetchExploreList('/trending/all/week', 'carousel-trending', null);
  await fetchExploreList('/movie/top_rated', 'carousel-movies', 'movie');
  await fetchExploreList('/tv/top_rated', 'carousel-tv', 'tv');
  await fetchExploreList('/movie/now_playing', 'carousel-upcoming', 'movie');
}

async function fetchExploreList(path, containerId, defaultMediaType, retries = 3) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!container.querySelector('.skeleton-card')) container.innerHTML = getSkeletonHTML(5);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const adult = userSettings.sfwFilter ? '&include_adult=false' : '';
      const res = await tmdbFetch(path + (path.includes('?') ? adult : '?' + adult.slice(1)));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = (data.results || []).filter(a => {
        if (defaultMediaType) return a.poster_path;
        return a.media_type !== 'person' && a.poster_path;
      }).slice(0, 10);
      container.innerHTML = items.map((a, idx) => {
        const mediaType = defaultMediaType || a.media_type || 'movie';
        const title = getTitle(a);
        const poster = getPosterUrl(a.poster_path);
        const score = a.vote_average ? a.vote_average.toFixed(1) : 'N/A';
        const typeLabel = mediaType === 'tv' ? 'TV' : 'Movie';
        return `
          <div class="explore-card-wrap" onclick="openModal(${a.id}, '${mediaType}', event)">
            <div class="explore-card">
              <img class="explore-card-img" src="${escHtml(poster)}" loading="lazy" onerror="this.src=''" alt="" draggable="false" oncontextmenu="return false"/>
            </div>
            <div class="explore-card-rank">${idx + 1}</div>
            <div class="explore-card-title">${escHtml(title)}</div>
            <div class="explore-card-meta">${typeLabel} · ★ ${score}</div>
          </div>`;
      }).join('');
      return;
    } catch(e) {
      if (attempt === retries) container.innerHTML = `<div class="explore-loading">Failed to load. Please try again later.</div>`;
    }
  }
}

async function fetchRandomTitle(forceNew = false) {
  const container = document.getElementById('randomPickGrid');
  const btn = document.getElementById('randomPickBtn');
  if (!container) return;
  const todayStr = todayDate();
  let state = { count: 0, items: [] };
  try { const stored = localStorage.getItem('cineq_random_pick_state'); if (stored) state = JSON.parse(stored); } catch(e) {}
  if (state.date !== todayStr) state = { date: todayStr, count: 0, items: [] };
  if (!forceNew && state.items?.length === 3) { renderRandomPicks(state.items); updateRandomLimit(state.count); return; }
  if (forceNew && state.count >= 6) { showToast('Daily limit reached (6/6). Come back tomorrow!'); return; }
  container.innerHTML = getSkeletonHTML(3, true);
  if (btn) btn.classList.add('loading');
  lucide.createIcons();
  try {
    const page = Math.floor(Math.random() * 50) + 1;
    const adult = userSettings.sfwFilter ? '&include_adult=false' : '';
    const useTV = Math.random() > 0.5;
    const path = useTV
      ? `/discover/tv?sort_by=popularity.desc&vote_average.gte=6.8&vote_count.gte=200&page=${page}${adult}`
      : `/discover/movie?sort_by=popularity.desc&vote_average.gte=6.5&vote_count.gte=500&page=${page}${adult}`;
    const res = await tmdbFetch(path);
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    const mediaType = useTV ? 'tv' : 'movie';
    let candidates = (data.results || []).filter(a => a.poster_path && !watchlist.some(w => w.id === a.id && w.media_type === mediaType));
    candidates = candidates.sort(() => 0.5 - Math.random());
    const newItems = [];
    for (const a of candidates) {
      if (newItems.length >= 3) break;
      a._mediaType = mediaType;
      const aGenres = a.genre_ids || [];
      const overlap = newItems.some(ex => (ex.genre_ids || []).some(g => aGenres.includes(g)));
      if (!overlap) newItems.push(a);
    }
    if (newItems.length < 3) {
      for (const a of candidates) {
        if (newItems.length >= 3) break;
        if (!newItems.some(ex => ex.id === a.id)) { a._mediaType = mediaType; newItems.push(a); }
      }
    }
    if (newItems.length >= 3) {
      if (forceNew) state.count++;
      state.items = newItems.slice(0, 3);
      localStorage.setItem('cineq_random_pick_state', JSON.stringify(state));
      renderRandomPicks(state.items);
      updateRandomLimit(state.count);
      save();
    } else { throw new Error('Not enough items'); }
  } catch(e) {
    container.innerHTML = `<div class="explore-loading" style="grid-column:1/-1;">Failed to fetch suggestions.</div>`;
  } finally { if (btn) btn.classList.remove('loading'); }
}

function updateRandomLimit(count) {
  const limitText = document.getElementById('randomLimitText');
  if (limitText) limitText.textContent = `${6 - count}/6 remaining`;
}

function renderRandomPicks(items) {
  const container = document.getElementById('randomPickGrid');
  if (!container) return;
  container.innerHTML = items.map(a => {
    const mediaType = a._mediaType || a.media_type || 'movie';
    const title = getTitle(a);
    const poster = getPosterUrl(a.poster_path);
    const score = a.vote_average ? a.vote_average.toFixed(1) : 'N/A';
    const typeLabel = mediaType === 'tv' ? 'TV' : 'Movie';
    return `
    <div class="explore-card" style="width:100%;flex-shrink:1;" onclick="openModal(${a.id}, '${mediaType}', event)">
      <div style="aspect-ratio:2/3;border-radius:var(--radius-md);overflow:hidden;position:relative;margin-bottom:8px;">
        <img class="explore-card-img" src="${escHtml(poster)}" loading="lazy" onerror="this.src=''" alt="" draggable="false" oncontextmenu="return false" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"/>
      </div>
      <div class="explore-card-title" style="font-size:14px;">${escHtml(title)}</div>
      <div class="explore-card-meta" style="font-size:12px;">${typeLabel} · ★ ${score}</div>
    </div>`;
  }).join('');
}

// ===== GOOGLE CALENDAR SCHEDULE =====
function openSchedule(titleId) {
  if (!currentModalTitle || currentModalTitle.id !== titleId) return;
  currentScheduleTitle = currentModalTitle;
  const isMovie = currentModalMediaType === 'movie';
  const content = document.getElementById('scheduleContent');
  const titleStr = getTitle(currentScheduleTitle);
  const episodes = isMovie ? null : (currentScheduleTitle.number_of_episodes || 12);
  content.innerHTML = `
    <div class="schedule-content">
      <div class="schedule-title">Schedule Watch</div>
      <div class="schedule-subtitle">${escHtml(titleStr)}</div>
      <form id="scheduleForm" onsubmit="event.preventDefault(); handleScheduleSubmit();">
        <div class="schedule-row">
          <div class="schedule-field">
            <label>Start Date</label>
            <input type="date" id="schStartDate" required />
          </div>
          <div class="schedule-field">
            <label>Time</label>
            <input type="time" id="schTime" required />
          </div>
        </div>
        ${!isMovie ? `
        <div class="schedule-row">
          <div class="schedule-field">
            <label>Frequency</label>
            <select id="schFreq">
              <option value="1">Daily (1 ep/day)</option>
              <option value="2">Every 2 days</option>
              <option value="7">Weekly (1 ep/week)</option>
            </select>
          </div>
          <div class="schedule-field">
            <label>Episodes</label>
            <input type="number" id="schEps" min="1" max="${episodes}" value="${episodes}" required />
          </div>
        </div>` : ''}
        <div class="schedule-actions">
          <button type="button" class="schedule-cancel" onclick="closeScheduleDirect()">Cancel</button>
          <button type="submit" class="schedule-submit">Add to Calendar</button>
        </div>
      </form>
    </div>
  `;
  document.getElementById('schStartDate').valueAsDate = new Date();
  document.getElementById('scheduleBackdrop').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeSchedule(e) { if (e.target === document.getElementById('scheduleBackdrop')) closeScheduleDirect(); }
function closeScheduleDirect() {
  document.getElementById('scheduleBackdrop').style.display = 'none';
  if (!document.getElementById('modalBackdrop').classList.contains('open') && !document.getElementById('lightboxBackdrop').classList.contains('open')) document.body.style.overflow = '';
}

function handleScheduleSubmit() {
  if (!gapiInited || !gisInited) return showToast('Calendar API not ready yet. Try again in a moment.');
  tokenClient.requestAccessToken({prompt: 'consent'});
}

async function submitCalendarEvent() {
  const startDate = document.getElementById('schStartDate').value;
  const time = document.getElementById('schTime').value;
  const isMovie = currentModalMediaType === 'movie';
  const startDateTime = new Date(`${startDate}T${time}`);
  const runtime = isMovie ? (currentScheduleTitle.runtime || 120) : 25;
  const endDateTime = new Date(startDateTime.getTime() + runtime * 60000);
  const titleStr = getTitle(currentScheduleTitle);
  const event = {
    summary: `Watch ${titleStr}`,
    description: `Scheduled via CineQ\n\nhttps://www.themoviedb.org/${currentModalMediaType}/${currentScheduleTitle.id}`,
    start: { dateTime: startDateTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    end: { dateTime: endDateTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  };
  if (!isMovie) {
    const freqVal = parseInt(document.getElementById('schFreq').value);
    const count = parseInt(document.getElementById('schEps').value);
    const byDayMap = {1:'DAILY', 2:'DAILY', 7:'WEEKLY'};
    const intervalStr = freqVal === 2 ? ';INTERVAL=2' : '';
    event.recurrence = [`RRULE:FREQ=${byDayMap[freqVal]}${intervalStr};COUNT=${count}`];
  }
  try {
    const btn = document.querySelector('.schedule-submit');
    const oldTxt = btn.textContent;
    btn.textContent = 'Saving...'; btn.disabled = true;
    await gapi.client.calendar.events.insert({ calendarId: 'primary', resource: event });
    showToast('Successfully scheduled in Google Calendar!');
    closeScheduleDirect();
  } catch (err) {
    console.error(err);
    showToast('Failed to add to calendar.');
  }
}

// Initialize Explore Indicator
if (!localStorage.getItem('cineqExploreClicked')) {
  const tab = document.getElementById('tabExplore');
  if (tab) tab.classList.add('new');
}

// ===== SPLASH SCREEN =====
function hideSplash() {
  const splash = document.getElementById('splashScreen');
  if (splash && !splash.classList.contains('fade-out')) {
    splash.classList.add('fade-out');
    setTimeout(() => { splash.style.display = 'none'; }, 500);
  }
}

// ===== SETTINGS SYSTEM =====
function loadLocalSettings() {
  try {
    const saved = localStorage.getItem('cineq_settings');
    if (saved) userSettings = { ...userSettings, ...JSON.parse(saved) };
  } catch (e) { console.error('Error loading settings', e); }
  applySettings();
}

async function syncSettingsFromFirestore() {
  if (!db || !currentUser) return;
  try {
    const docSnap = await db.collection("cineq_users").doc(currentUser.uid).get();
    if (docSnap.exists) {
      const data = docSnap.data();
      if (data.settings) {
        userSettings = { ...userSettings, ...data.settings };
        localStorage.setItem('cineq_settings', JSON.stringify(userSettings));
        applySettings();
      }
    }
  } catch (e) { console.error("Error syncing settings", e); }
}

async function saveSettings() {
  localStorage.setItem('cineq_settings', JSON.stringify(userSettings));
  if (!db || !currentUser) return;
  try {
    await db.collection("cineq_users").doc(currentUser.uid).set({ settings: userSettings }, { merge: true });
  } catch (e) { console.error("Error saving settings", e); }
}

function applySettings() {
  if (userSettings.theme === 'light') document.body.classList.add('light-theme');
  else document.body.classList.remove('light-theme');
  updateSettingsModalUI();
}

function applyWatchlistPreferencesOnLoad() {
  currentSort = userSettings.defaultSort;
  currentSortOrder = userSettings.defaultSortOrder;
  const viewMap = { 'list':'tabList', 'watching':'tabWatching', 'watched':'tabWatched', 'explore':'tabExplore' };
  const targetTabId = viewMap[userSettings.defaultView] || 'tabList';
  const btn = document.getElementById(targetTabId);
  if (btn) setFilter(userSettings.defaultView, btn);
}

// ===== SETTINGS MODAL =====
function openSettings() {
  const menu = document.getElementById('profileMenu');
  if (menu) menu.style.display = 'none';
  document.getElementById('settingsBackdrop').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  const usernameInput = document.getElementById('settingsUsername');
  if (usernameInput && currentUser) usernameInput.value = currentUser.displayName || '';
  const emailText = document.getElementById('settingsEmail');
  if (emailText && currentUser) emailText.textContent = currentUser.email;
  const badge = document.getElementById('settingsEmailBadge');
  if (badge && currentUser) badge.style.display = currentUser.emailVerified ? 'inline-flex' : 'none';
  updateSettingsModalUI();
  lucide.createIcons();
}

function closeSettings(event) { if (event && event.target.id === 'settingsBackdrop') closeSettingsDirect(); }
function closeSettingsDirect() { document.getElementById('settingsBackdrop').style.display = 'none'; document.body.style.overflow = ''; }

function switchSettingsTab(tabName, btn) {
  document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
  document.getElementById(`pane-${tabName}`).classList.add('active');
}

function updateSettingsModalUI() {
  const themeToggle = document.getElementById('settingsThemeToggle');
  if (themeToggle) themeToggle.checked = (userSettings.theme === 'light');
  const defaultViewSel = document.getElementById('settingsDefaultView');
  if (defaultViewSel) defaultViewSel.value = userSettings.defaultView;
  const defaultSortSel = document.getElementById('settingsDefaultSort');
  if (defaultSortSel) defaultSortSel.value = userSettings.defaultSort;
  const defaultSortOrderSel = document.getElementById('settingsDefaultSortOrder');
  if (defaultSortOrderSel) defaultSortOrderSel.value = userSettings.defaultSortOrder;
  const sfwFilterChk = document.getElementById('settingsSfwFilter');
  if (sfwFilterChk) sfwFilterChk.checked = userSettings.sfwFilter;
  
  const customName = document.getElementById('settingsCustomListName');
  if (customName) customName.value = userSettings.customList?.name || '';
  const customPos = document.getElementById('settingsCustomListPos');
  if (customPos) customPos.value = userSettings.customList?.position || '6';
  
  // Inject Custom List tab dynamically
  const normalFilters = document.getElementById('normalFilters');
  const tabCustom = document.getElementById('tabCustom');
  if (normalFilters && tabCustom) {
    if (userSettings.customList && userSettings.customList.name) {
      tabCustom.textContent = userSettings.customList.name;
      tabCustom.style.display = 'block';
      const pos = parseInt(userSettings.customList.position) || 6;
      // standard buttons are 5 (list, watching, watched, archive, explore). 
      // Flex spacer is child 5. Sort buttons are after.
      // We'll insert at pos-1 index among the first 5 buttons.
      const children = Array.from(normalFilters.children).filter(c => c.classList.contains('tab-btn') && c.id !== 'tabCustom');
      if (pos - 1 < children.length) {
        normalFilters.insertBefore(tabCustom, children[pos - 1]);
      } else {
        normalFilters.insertBefore(tabCustom, normalFilters.querySelector('div[style*="flex:1"]') || null);
      }
    } else {
      tabCustom.style.display = 'none';
      if (currentFilter === 'custom') {
        const listBtn = document.getElementById('tabList');
        if (listBtn) setFilter('list', listBtn);
      }
    }
  }
}

function saveCustomListSettings() {
  const nameInput = document.getElementById('settingsCustomListName');
  const posInput = document.getElementById('settingsCustomListPos');
  if (!nameInput || !posInput) return;
  
  const name = nameInput.value.trim();
  const pos = posInput.value;
  
  if (name.length > 15) return showToast('Custom list name too long');
  
  userSettings.customList = { name, position: pos };
  saveSettings();
  applySettings();
  showToast('Custom List updated');
}

// ===== ACCOUNT ACTIONS =====
async function updateProfileUsername() {
  const newName = document.getElementById('settingsUsername').value.trim();
  if (!newName) return showToast('Username cannot be empty');
  if (newName.length > 15) return showToast('Username cannot be more than 15 characters');
  const user = firebase.auth().currentUser;
  if (!user) return;
  try {
    await user.updateProfile({ displayName: newName });
    if (db) await db.collection("cineq_users").doc(user.uid).update({ username: newName });
    document.getElementById('userEmail').innerHTML = `<span class="profile-hi">Hi</span><span class="profile-username">@${escHtml(newName)}</span>`;
    showToast('Username updated successfully');
  } catch (e) { showToast('Failed to update username'); }
}

async function sendSettingsPasswordReset() {
  const user = firebase.auth().currentUser;
  if (!user) return;
  try {
    await firebase.auth().sendPasswordResetEmail(user.email);
    showToast('Password reset link sent! Check your inbox.');
  } catch (e) { showToast('Failed to send reset link'); }
}

function setAppTheme(themeName) { userSettings.theme = themeName; saveSettings(); applySettings(); showToast(`Theme changed to ${themeName === 'light' ? 'Light' : 'Dark'} Mode`); }
function toggleAppTheme(isLight) { setAppTheme(isLight ? 'light' : 'dark'); }

function updateWatchlistPreference(key, value) {
  userSettings[key] = value;
  saveSettings();
  if (key === 'defaultSort') { currentSort = value; renderGrid(); }
  else if (key === 'defaultSortOrder') { currentSortOrder = value; renderGrid(); }
  showToast('Preferences updated');
}

function exportWatchlistData() {
  try {
    const today = todayDate();
    let exportState = { date: today, count: 0 };
    try { const stored = localStorage.getItem('cineq_export_state'); if (stored) exportState = JSON.parse(stored); } catch(e) {}
    if (exportState.date !== today) exportState = { date: today, count: 0 };
    if (exportState.count >= 3) {
      showToast('Daily export limit reached (3/3). Resets tomorrow.');
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(watchlist, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `cineq_watchlist_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    exportState.count++;
    localStorage.setItem('cineq_export_state', JSON.stringify(exportState));
    showToast('Watchlist exported successfully');
  } catch (e) { showToast('Failed to export data'); }
}
// ===== ARCHIVE / DROP LOGIC =====
async function promptArchive(id, mediaType) {
  const item = watchlist.find(w => w.id === id && w.media_type === mediaType);
  if (!item) return;
  const timeStr = prompt("Where did you leave off? (e.g. '1h 20m' or 'S02E04')");
  if (timeStr === null) return;
  item.archived = true;
  item.archiveTime = timeStr.trim() || 'Unknown';
  item.watched = false; // ensure it's not in watched
  await save();
  renderGrid();
  openModal(id, mediaType);
  showToast('Moved to dropped/archive');
}

async function unarchive(id, mediaType) {
  const item = watchlist.find(w => w.id === id && w.media_type === mediaType);
  if (!item) return;
  item.archived = false;
  item.archiveTime = null;
  await save();
  renderGrid();
  openModal(id, mediaType);
  showToast('Restored from archive');
}
// ===== HEADER LOGO CLICK RESET =====
function resetToHome() {
  clearSearch();
  if (deleteMode) toggleSelectMode();
  const tabList = document.getElementById('tabList');
  if (tabList) setFilter('list', tabList);
}

// ===== FLOWMODE SPARKLE PARTICLES =====
(function() {
  const btn = document.getElementById('flowModeBtn');
  if (!btn) return;
  let isHovered = false;
  btn.addEventListener('click', () => { btn.classList.toggle('is-selected'); });
  btn.addEventListener('mouseenter', () => isHovered = true);
  btn.addEventListener('mouseleave', () => isHovered = false);
  function spawnParticle() {
    if (btn.offsetWidth === 0 || btn.offsetHeight === 0) { setTimeout(spawnParticle, 350); return; }
    const particle = document.createElement('div');
    particle.classList.add('particle');
    const size = Math.random() * 3 + 2;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${Math.random() * btn.offsetWidth}px`;
    particle.style.top = `${Math.random() * btn.offsetHeight}px`;
    const animDuration = isHovered ? (Math.random() * 0.3 + 0.6) : (Math.random() * 0.5 + 1.2);
    particle.style.animationDuration = `${animDuration}s`;
    btn.appendChild(particle);
    setTimeout(() => { particle.remove(); }, animDuration * 1000);
    setTimeout(spawnParticle, isHovered ? 120 : 350);
  }
  spawnParticle();
})();

function calculateSeasonAndEpisode(episodesWatched, seasons) {
  if (!seasons || !Array.isArray(seasons)) return { season: 1, episode: episodesWatched || 0, totalSeasons: 1, seasonEpisodes: 0 };
  const regularSeasons = seasons.filter(s => s.season_number > 0).sort((a,b) => a.season_number - b.season_number);
  if (regularSeasons.length === 0) return { season: 1, episode: episodesWatched || 0, totalSeasons: 1, seasonEpisodes: 0 };
  
  let eps = episodesWatched || 0;
  let s = regularSeasons[0].season_number;
  let maxS = regularSeasons[regularSeasons.length - 1].season_number;
  
  for (const season of regularSeasons) {
    if (eps <= season.episode_count || season === regularSeasons[regularSeasons.length - 1]) {
      // If eps == 0, we are at EP0 of the first season.
      return { season: season.season_number, episode: eps, totalSeasons: maxS, seasonEpisodes: season.episode_count || 0 };
    }
    eps -= season.episode_count;
  }
  return { season: s, episode: eps, totalSeasons: maxS, seasonEpisodes: regularSeasons[regularSeasons.length - 1].episode_count || 0 };
}

function changeSeason(id, change) {
  const item = watchlist.find(i => i.id === id && i.media_type === 'tv');
  if (!item || !currentModalTitle || !currentModalTitle.seasons) return;
  const regularSeasons = currentModalTitle.seasons.filter(s => s.season_number > 0).sort((a,b) => a.season_number - b.season_number);
  if (regularSeasons.length === 0) return;
  
  const epInfo = calculateSeasonAndEpisode(item.episodesWatched, currentModalTitle.seasons);
  let newS = epInfo.season + change;
  if (newS < 1) newS = 1;
  if (newS > regularSeasons[regularSeasons.length - 1].season_number) newS = regularSeasons[regularSeasons.length - 1].season_number;
  
  let newEpisodesWatched = 0;
  for (const season of regularSeasons) {
    if (season.season_number < newS) {
      newEpisodesWatched += season.episode_count;
    } else if (season.season_number === newS) {
      newEpisodesWatched += 1; // reset to 1st episode of the new season
    }
  }
  
  const changeAmt = newEpisodesWatched - (item.episodesWatched || 0);
  if (changeAmt !== 0) {
    updateProgress(id, changeAmt, null, false);
  }
}

// ===== IMPORT LOGIC =====
function parseCSV(str) {
  const arr = [];
  let quote = false;
  let row = [], col = '';
  for (let c = 0; c < str.length; c++) {
    let cc = str[c], nc = str[c+1];
    if (cc === '"' && quote && nc === '"') { col += cc; ++c; continue; }
    if (cc === '"') { quote = !quote; continue; }
    if (cc === ',' && !quote) { row.push(col.trim()); col = ''; continue; }
    if (cc === '\r' && nc === '\n' && !quote) { row.push(col.trim()); arr.push(row); col = ''; row = []; ++c; continue; }
    if (cc === '\n' && !quote) { row.push(col.trim()); arr.push(row); col = ''; row = []; continue; }
    if (cc === '\r' && !quote) { row.push(col.trim()); arr.push(row); col = ''; row = []; continue; }
    col += cc;
  }
  if (col) row.push(col.trim());
  if (row.length) arr.push(row);
  return arr;
}

async function handleImport(event, source) {
  const file = event.target.files[0];
  if (!file) return;
  const today = todayDate();
  let importState = { date: today, count: 0 };
  try { const stored = localStorage.getItem('cineq_import_state'); if (stored) importState = JSON.parse(stored); } catch(e) {}
  if (importState.date !== today) importState = { date: today, count: 0 };
  if (importState.count >= 3) {
    showToast('Daily import limit reached (3/3). Resets tomorrow.');
    event.target.value = '';
    return;
  }

  showToast('Reading file...');
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const contents = e.target.result;
      if (source === 'cineq') {
        const parsed = JSON.parse(contents);
        if (!Array.isArray(parsed)) throw new Error('Invalid JSON');
        let added = 0, skipped = 0;
        for (const item of parsed) {
          if (!item.id || !item.media_type) continue;
          if (watchlist.find(w => w.id == item.id && w.media_type === item.media_type)) skipped++;
          else { watchlist.unshift(item); added++; }
        }
        if (added > 0) {
          importState.count++;
          localStorage.setItem('cineq_import_state', JSON.stringify(importState));
          await save(); renderGrid();
        }
        showToast(`Imported ${added} titles. Skipped ${skipped} duplicates.`);
        event.target.value = '';
        return;
      }
      
      const rows = parseCSV(contents);
      if (rows.length < 2) throw new Error('Empty CSV');
      const headers = rows[0].map(h => h.toLowerCase());
      const toFetch = [];
      
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (source === 'letterboxd') {
          const nameIdx = headers.indexOf('name');
          const yearIdx = headers.indexOf('year');
          if (nameIdx >= 0 && r[nameIdx]) toFetch.push({ type: 'letterboxd', name: r[nameIdx], year: r[yearIdx] });
        } else if (source === 'imdb') {
          const idIdx = headers.indexOf('const');
          const typeIdx = headers.indexOf('title type');
          if (idIdx >= 0 && r[idIdx]) toFetch.push({ type: 'imdb', id: r[idIdx], imdbType: r[typeIdx] });
        }
      }
      
      if (toFetch.length === 0) throw new Error('No valid rows found');
      if (toFetch.length > 500) { showToast('File too large. Max 500 items per import.'); event.target.value = ''; return; }
      
      processImport(toFetch, importState);
    } catch (err) { console.error(err); showToast('Failed to parse file.'); }
    event.target.value = '';
  };
  reader.readAsText(file);
}

async function processImport(items, importState) {
  let added = 0, skipped = 0, failed = 0;
  showToast(`Starting import of ${items.length} titles... This may take a minute.`);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      let tmdbItem = null;
      let mediaType = 'movie';
      if (it.type === 'letterboxd') {
        const url = `${baseUrl}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(it.name)}${it.year ? '&year='+it.year : ''}`;
        const res = await fetch(url).then(r => r.json());
        if (res.results && res.results.length > 0) tmdbItem = res.results[0];
      } else if (it.type === 'imdb') {
        const url = `${baseUrl}/find/${it.id}?api_key=${apiKey}&external_source=imdb_id`;
        const res = await fetch(url).then(r => r.json());
        if (res.movie_results && res.movie_results.length > 0) { tmdbItem = res.movie_results[0]; mediaType = 'movie'; }
        else if (res.tv_results && res.tv_results.length > 0) { tmdbItem = res.tv_results[0]; mediaType = 'tv'; }
      }
      
      if (!tmdbItem) { failed++; continue; }
      
      if (watchlist.find(w => w.id == tmdbItem.id && w.media_type === mediaType)) {
        skipped++;
      } else {
        watchlist.unshift({
          id: tmdbItem.id,
          media_type: mediaType,
          title: tmdbItem.title || tmdbItem.name,
          poster: tmdbItem.poster_path ? `/images/tmdb/w500${tmdbItem.poster_path}` : null,
          addedAt: new Date().toISOString(),
          watched: false
        });
        added++;
      }
    } catch (e) { failed++; }
    
    // throttle to avoid tmdb rate limits
    if (i % 5 === 0 && i > 0) await new Promise(r => setTimeout(r, 200));
  }
  
  if (added > 0) {
    importState.count++;
    localStorage.setItem('cineq_import_state', JSON.stringify(importState));
    await save(); renderGrid();
  }
  showToast(`Import complete! Added: ${added}, Skipped: ${skipped}, Failed: ${failed}`);
}

// ===== NOTIFICATIONS =====
async function toggleNotify(id, mediaType, title) {
  const existing = notifications.findIndex(n => n.id === id && n.mediaType === mediaType);
  if (existing >= 0) {
    notifications.splice(existing, 1);
    showToast(`Removed notification for "${title}"`);
  } else {
    notifications.unshift({ id, mediaType, title, timestamp: Date.now() });
    showToast(`We will notify you about "${title}"`);
  }
  await save();
  renderNotifications();
  // re-render the modal to toggle the button style
  const modal = document.getElementById('modalBackdrop');
  if (modal.classList.contains('open')) openModal(id, mediaType);
}

function renderNotifications() {
  const list = document.getElementById('notifList');
  const badge = document.getElementById('notifBadge');
  if (!list || !badge) return;
  
  if (notifications.length === 0) {
    list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">No new notifications</div>`;
    badge.style.display = 'none';
    return;
  }
  
  badge.style.display = 'block';
  list.innerHTML = notifications.map(n => `
    <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;cursor:pointer;" onclick="openModal(${n.id}, '${n.mediaType}', event)">
      <div style="width:8px;height:8px;background:var(--accent);border-radius:50%;flex-shrink:0;"></div>
      <div style="flex-grow:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text);">${escHtml(n.title)}</div>
        <div style="font-size:11px;color:var(--muted);">We'll notify you when it releases!</div>
      </div>
      <button class="icon-btn" style="flex-shrink:0;width:24px;height:24px;" onclick="toggleNotify(${n.id}, '${n.mediaType}', '${escHtml(n.title).replace(/'/g,"\\'")}'); event.stopPropagation();"><i data-lucide="x" style="width:12px;height:12px;"></i></button>
    </div>
  `).join('');
  lucide.createIcons();
}
