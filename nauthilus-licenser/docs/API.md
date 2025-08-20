# API des Lizenz-Servers

Base URL: https://license.example.com (lokal: http://localhost:8080)

Öffentliche Endpunkte
- GET /.well-known/jwks.json
  - Liefert JWKS mit allen aktiven Public Keys.
- POST /api/license/validate
  - Body: { "token": "<JWT>" }
  - Antwort: { "valid": true } (Debug; eigentliche Verifikation sollte Consumer-seitig mit JWKS erfolgen)

Auth/Lizenz-Flow
- POST /api/auth/token
  - Request: { "userId": "<id>" } oder { "refresh_token": "<token>" }
  - Response: { "access_token": "<JWT>", "expires_in": <sec> }
- POST /api/auth/refresh
  - Request: { "refresh_token": "<token>" }
  - Response: { "access_token": "<JWT>", "expires_in": <sec> }

Mollie Webhook
- POST /api/webhooks/mollie
  - Content-Type: application/x-www-form-urlencoded (id=tr_xxx) oder JSON { "id": "tr_xxx" }
  - Server lädt Payment/Subscription via Mollie v2 API und aktualisiert DB. Idempotent.

Admin Endpunkte
- POST /api/admin/license/general
  - Header: X-Admin-Key: <ADMIN_API_KEY>
  - Body: { "userId": "<id>", "scope": "*" }
  - Response: { "access_token": "<JWT>" } (permanent; perm:true, role:admin, kein exp)

Hinweise
- Claims siehe README.md. RS256 mit kid; Public Keys per JWKS.
- Blacklist/Key-Rotation Schnittstellen sind intern vorbereitet (Repo), Endpunkte folgen.
