# Hosted Policy & Support Pages — Indian Form Helper

This directory contains standalone, zero-dependency, deploy-ready HTML pages that satisfy Google Play Store public policy requirements.

## 📄 Pages Included

1. **`privacy.html`** (`/privacy`)
   - Complete 9-section Privacy Policy covering 100% on-device WebAssembly execution and zero-upload guarantee.
   - Row-for-row match with Google Play Console's Data Safety declaration.
   - Publicly accessible policy required by Google Play (§3 & §4).

2. **`delete-account.html`** (`/delete-account`)
   - Public Account and Data Deletion request portal required by Google Play policy for apps with account creation (§5).
   - Explains what data is deleted vs. what is never stored (documents stay strictly on-device).
   - In-app instructions + one-tap email deletion request button (`support@indianformhelper.app`).

3. **`index.html`** (`/`)
   - Clean landing and navigation hub linking to both policies with application overview and support contact.

4. **`_redirects`**
   - Clean URL routing configuration for Cloudflare Pages, Netlify, and compatible hosts (`/privacy` -> `/privacy.html`, `/delete-account` -> `/delete-account.html`).

---

## 🚀 Quick Deployment Options

### Option A: Cloudflare Pages (Recommended - Free & Fast)
1. Go to **Cloudflare Dashboard** → **Workers & Pages** → **Create application** → **Pages**.
2. Connect your Git repository (or use Direct Upload and drag this `docs/hosted` folder).
3. Set Build Output directory to `docs/hosted` (if building from repo) or root (if direct upload).
4. Assign your custom domain: `indianformhelper.app`.
   - Your URLs will be live at:
     - `https://indianformhelper.app/privacy`
     - `https://indianformhelper.app/delete-account`

### Option B: GitHub Pages (Free)
1. In repository settings → **Pages**.
2. Set branch to `main`, folder to `/docs` (or copy these files to a dedicated `gh-pages` branch).
3. Connect your custom domain `indianformhelper.app`.

### Option C: Vercel / Netlify
1. Drag and drop the `docs/hosted` directory onto Netlify Drop or import via Vercel.
2. Link domain `indianformhelper.app`.

### Option D: Nginx / Apache
Copy files to your web root (`/var/www/html/`):
```nginx
# Nginx clean URL snippet
location /privacy {
    try_files /privacy.html =404;
}
location /delete-account {
    try_files /delete-account.html =404;
}
```
