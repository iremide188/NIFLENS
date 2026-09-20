# NIFLENS — Football Photography & Visual Media

Public portfolio site + private photo gallery delivery platform.

## Structure

- `index.html` — home (hero, services, selected work, about, delivery flow)
- `portfolio.html` — portfolio with categories, fed from `data/portfolio.json`
- `about.html` — about NIFLENS
- `contact.html` — Work With NIFLENS contact form
- `gallery.html` — private client gallery: browse, select, request download, verify code, download
- `admin.html` — admin dashboard (token login)
- `js/` — page scripts; `js/admin.js` is the dashboard
- `css/styles.css` — design system
- `assets/site/` — public site imagery (royalty-free, Pexels)
- `assets/previews/` — optimized gallery previews (public, machine-generated)
- `assets/originals/` — full-quality gallery photos (unguessable paths, only revealed after server-side code verification)

## Admin

Open `/admin.html` and sign in with the NIFLENS access token. The dashboard
verifies the token server-side against GitHub; only the repo owner can sign in.

Workflow: create a gallery, upload photos, copy the private gallery link,
send it to the client. When the client requests a download, generate a code
(DOWNLOAD CODES tab) and send it to them. Codes are single-use and verified
server-side; after one successful download the code is dead.

## Photos

`assets/originals/` files keep their original quality and are never linked on
any public page. Gallery visitors only see the compressed previews. The
original URLs are returned only by the verification endpoint, and only for
the photos the client selected.
