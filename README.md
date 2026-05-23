<p align="center">
  <img src="assets/images/cineqLogoForDarkMode.png" alt="CineQ Logo" width="220" />
</p>

<p align="center">
  <strong>A sleek movie & TV series watchlist to share with your friends.</strong><br/>
  Track what you're watching, discover new titles, and keep your list perfectly organised.
</p>

<p align="center">
  <a href="https://cine-q.vercel.app/"><img src="https://img.shields.io/badge/🌐_Live_Demo-Visit_Now-eab308?style=for-the-badge" alt="Live Demo" /></a>
  <img src="https://img.shields.io/badge/Firebase-Auth_%26_Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase" />
  <br/>
  <img src="https://img.shields.io/badge/TMDB-API_v3-01B4E4?style=for-the-badge&logo=themoviedatabase&logoColor=white" alt="TMDB" />
  <img src="https://img.shields.io/github/last-commit/amorish/CineQ?style=flat-square&color=eab308" alt="Last Commit" />
  <img src="https://img.shields.io/github/repo-size/amorish/CineQ?style=flat-square&color=333" alt="Repo Size" />
  <img src="https://img.shields.io/github/license/amorish/CineQ?style=flat-square&color=333" alt="License" />
</p>

---

## ![Features icon](https://api.iconify.design/lucide/sparkles.svg?color=white) Features

| Feature | Description |
|---------|-------------|
| ![Secure Auth icon](https://api.iconify.design/lucide/lock.svg?color=white) **Secure Auth** | Email/password login & signup with Firebase - smart auto-detection for new users |
| ![Instant Search icon](https://api.iconify.design/lucide/search.svg?color=white) **Instant Search** | Search 1M+ movies & TV series via the TMDB API with live dropdown results |
| ![Watchlist icon](https://api.iconify.design/lucide/clipboard-list.svg?color=white) **Personal Watchlist** | Add, remove, and mark titles as watched - synced to the cloud in real-time |
| ![Google Calendar icon](https://api.iconify.design/lucide/calendar.svg?color=white) **Google Calendar** | Schedule watch times directly to your Google Calendar |
| ![Random Pick icon](https://api.iconify.design/lucide/dices.svg?color=white) **Random Pick** | Get 3 diverse, high-quality movie/TV suggestions instantly (6/day limit) |
| ![Live Stats icon](https://api.iconify.design/lucide/bar-chart-2.svg?color=white) **Live Stats** | Track total, watched, and remaining titles at a glance |
| ![Rich Details icon](https://api.iconify.design/lucide/clapperboard.svg?color=white) **Rich Details** | Click any card to see synopsis, collection watch order, director, studio, cast, and more |
| ![Filter & Sort icon](https://api.iconify.design/lucide/sliders-horizontal.svg?color=white) **Filter & Sort** | Quick filter between List / Watching / Watched views with 4 sort modes |
| ![FlowMode icon](https://api.iconify.design/lucide/zap.svg?color=white) **FlowMode** | Intelligent algorithm sequences your unwatched list to optimise engagement and prevent fatigue |
| ![Episode Tracking icon](https://api.iconify.design/lucide/tv.svg?color=white) **Episode Tracking** | Track episode progress for TV series directly from the card |
| ![Collection Order icon](https://api.iconify.design/lucide/list-ordered.svg?color=white) **Collection Order** | For movie franchises, CineQ shows the correct chronological watch order automatically |
| ![Themes icon](https://api.iconify.design/lucide/palette.svg?color=white) **Themes** | Toggle between premium Dark and Light modes |
| ![Settings icon](https://api.iconify.design/lucide/settings.svg?color=white) **Settings** | Account management, username, theme, watchlist preferences, and JSON data backup |

---

## ![Quick Start icon](https://api.iconify.design/lucide/rocket.svg?color=white) Quick Start

### 1. Clone the Repo
```bash
git clone https://github.com/amorish/CineQ.git
cd CineQ
```

### 2. Get a TMDB API Key (Free)
1. Create a free account at [themoviedb.org](https://www.themoviedb.org)
2. Go to **Settings → API → Create → Developer**
3. Copy your **Read Access Token** (the long Bearer token)
4. Paste it into `assets/js/app.js` at the `TMDB_TOKEN` constant

### 3. Set Up Firebase (Free)
1. Go to [Firebase Console](https://console.firebase.google.com/) and create a new project
2. Add a **Web App** and copy the `firebaseConfig`
3. Paste it into `assets/js/app.js` (top of file, `firebaseConfig` object)
4. Enable **Authentication → Email/Password**
5. Enable **Firestore Database** (start in production mode)

### 4. Set Firestore Security Rules
Go to Firestore → Rules and paste:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /cineq_users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /cineq_watchlists/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### 5. Deploy or Open Locally
Open `index.html` directly in a browser, **or** deploy free on Vercel/Netlify/GitHub Pages.

---

## ![Vercel icon](https://api.iconify.design/lucide/triangle.svg?color=white) Deploy to Vercel (Recommended)

1. Push this repo to GitHub (already done)
2. Go to [vercel.com](https://vercel.com) → **Add New Project**
3. Import the `CineQ` GitHub repository
4. **Framework Preset**: select **Other** (it's a static site)
5. **Root Directory**: leave as `/` (default)
6. **Build Command**: leave empty
7. **Output Directory**: leave as `.` or empty
8. Click **Deploy** - done! ✅

Vercel auto-deploys on every `git push` to `main`.

---

## ![Tech Stack icon](https://api.iconify.design/lucide/layers.svg?color=white) Tech Stack

| Tech | Purpose |
|------|---------|
| **HTML5 / CSS3 / Vanilla JS** | Core frontend - zero frameworks, ultra-lightweight |
| **Firebase Auth** | Secure user authentication |
| **Cloud Firestore** | Real-time database for watchlists |
| **TMDB API v3** | Movie & TV data (1M+ titles) |
| **Lucide Icons** | Beautiful SVG icon set |
| **Google Fonts** | Outfit (headings) + Inter (body) |
| **Google Calendar API** | Schedule watch events |

---

## ![Project Structure icon](https://api.iconify.design/lucide/folder-tree.svg?color=white) Project Structure

```
CineQ/
├── index.html                        # Main app entry point
├── robots.txt                        # SEO crawler rules
├── sitemap.xml                       # SEO sitemap
├── vercel.json                       # Vercel deployment config
├── .gitignore                        # Git ignore rules
├── LICENSE                           # MIT License
├── README.md                         # Documentation
├── scripts/
│   ├── build.js                      # Build script to generate env.js
│   └── test_csv.js                   # Development script for parsing CSV
└── assets/
    ├── css/
    │   └── style.css                 # Complete styling with golden theme
    ├── js/
    │   └── app.js                    # App logic, TMDB API, Firebase, UI
    └── images/
        ├── cineqLogoForDarkMode.png  # Logo for dark theme
        ├── cineqLogoForLightMode.png # Logo for light theme
        └── blocks_shuffle_loading.svg # Golden loading spinner
```

---

## ![Security icon](https://api.iconify.design/lucide/shield-check.svg?color=white) Security

- ![check icon](https://api.iconify.design/lucide/check-circle-2.svg?color=white) Firebase Authentication with friendly error handling
- ![check icon](https://api.iconify.design/lucide/check-circle-2.svg?color=white) Per-user data isolation (users can only access their own watchlist)
- ![check icon](https://api.iconify.design/lucide/check-circle-2.svg?color=white) XSS protection (`escHtml`) on all user-facing content
- ![check icon](https://api.iconify.design/lucide/check-circle-2.svg?color=white) Disposable/temporary email blocklist on signup
- ![check icon](https://api.iconify.design/lucide/check-circle-2.svg?color=white) SFW filter enabled by default for search & explore
- ![check icon](https://api.iconify.design/lucide/check-circle-2.svg?color=white) Firestore security rules enforce server-side access control
- ![check icon](https://api.iconify.design/lucide/check-circle-2.svg?color=white) No raw error messages exposed to users

---

## ![Roadmap icon](https://api.iconify.design/lucide/map.svg?color=white) Roadmap

- [ ] Personal ratings (1-10 stars)
- [ ] Search within your own watchlist
- [ ] Google Sign-In (one-click login)
- [ ] Statistics dashboard (hours watched, genre breakdown)
- [ ] Friend system & shared watchlists
- [ ] PWA support (install on phone)
- [ ] Import from Letterboxd / IMDb
- [x] Light/Dark mode toggle
- [x] Episode-by-episode progress tracking
- [x] Sort by score, year, name, date added
- [x] FlowMode intelligent sequencing
- [x] Collection watch order guides

---

## ![Contributing icon](https://api.iconify.design/lucide/users.svg?color=white) Contributing

Contributions are welcome! Feel free to fork and submit a PR.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## ![License icon](https://api.iconify.design/lucide/file-text.svg?color=white) License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  Created by <a href="https://github.com/amorish">@amorish</a>
</p>
