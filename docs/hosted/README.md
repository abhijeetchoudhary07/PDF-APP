# Hosted policy pages — Indian Form Helper

Static, dependency-free HTML that satisfies the two Google Play requirements a
listing cannot ship without: a publicly reachable **privacy policy** URL, and —
because this app has accounts — a public **account deletion** URL.

## Pages

| Path | File | Why Play needs it |
| --- | --- | --- |
| `/` | `index.html` | Landing page linking both policies |
| `/privacy` | `privacy/index.html` | Privacy policy, row-for-row match with the Data Safety form |
| `/delete-account` | `delete-account/index.html` | Public deletion request route, required for apps with sign-in |

Clean URLs come from the directory layout, not from host rewrite rules, so these
files serve identically on GitHub Pages, Cloudflare Pages, Netlify, Vercel or a
plain nginx root. There is deliberately no `_redirects` file: it only works on
some hosts, and a policy URL that 404s on the wrong host is the exact failure
mode this layout avoids.

## How it is published today

`.github/workflows/pages.yml` uploads this directory to GitHub Pages on every
push to `main` that touches it. Live at:

- `https://abhijeetchoudhary07.github.io/PDF-APP/privacy`
- `https://abhijeetchoudhary07.github.io/PDF-APP/delete-account`

**One-time setup:** repository **Settings → Pages → Build and deployment →
Source: GitHub Actions**. Until that is switched on the workflow will fail; it
cannot be enabled from a commit.

`.nojekyll` is present because Pages otherwise runs Jekyll, which skips paths it
treats as special.

## Moving to a custom domain later

Nothing in the app hard-codes these URLs — the Play listing holds them — so
switching hosts is a store-listing edit, not a client release.

1. Register the domain and add it under **Settings → Pages → Custom domain**
   (or point Cloudflare Pages at `docs/hosted`).
2. Update the two URLs in the Play Console listing.
3. Update `docs/PLAY_STORE.md` so the recorded URLs match what is live.

## Support address

Both pages show a support address, and the deletion page's primary mechanism is
a `mailto:` to it. Play reviewers do send mail to that address. Keep it a real,
monitored mailbox — see `tools/set-support-email.sh` to change it everywhere in
one command.
