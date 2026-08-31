# 9 Meridian

An electric-blue landing page, customer authentication flow, and feedback dashboard. The project has no third-party runtime dependencies.

## Run locally

```powershell
npm start
```

Open `http://127.0.0.1:4173`.

Demo account:

- Email: `demo@9meridian.com`
- Password: `Demo@123`

## Included

- Responsive cinematic landing page with an interactive canvas meridian
- Registration and sign-in with live validation and password strength
- Salted `scrypt` password hashing and HMAC-signed seven-day sessions
- Persistent local JSON mock datastore created on first run in `data/store.json`
- Customer overview with animated metrics
- Feedback rating, categories, character limits, attachment metadata, and history
- Accessible dialogs, error states, reduced-motion support, and mobile navigation

## Production note

This local API is intentionally database-free for immediate testing. Before internet deployment, set a strong `SESSION_SECRET`, use HTTPS, and replace the JSON store with a transactional database.
