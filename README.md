# Zangetsu — Site

Landing page for **Zangetsu**, which doubles as the password-reset page for its
Appwrite authentication.

- Open the site normally → a simple Zangetsu landing page.
- Open an Appwrite recovery link (`?userId=…&secret=…`) → a "set a new password"
  form that completes the reset via Appwrite.

Static — a single `index.html`, no build step. Host it on any static host
(Cloudflare Pages, GitHub Pages, Netlify, …). The page's domain must be added as
a **Web platform** in the Appwrite project for recovery emails to send.
