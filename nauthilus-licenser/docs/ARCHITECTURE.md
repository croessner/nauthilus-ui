# Architektur des Lizenz-Servers

Dieser Service ist ein eigenständiger Go-Dienst mit MongoDB und Mollie-Integration entsprechend dem Draft (Stand 2025-08-14).

- JWT: RS256, Signierschlüssel im Server, JWKS-Endpoint veröffentlicht Public Keys. Key Rotation unterstützt.
- Endpunkte:
  - GET /.well-known/jwks.json
  - POST /api/auth/token, /api/auth/refresh
  - POST /api/license/validate
  - POST /api/admin/license/general
  - POST /api/webhooks/mollie
- Datenmodell (Collections): users, subscriptions, licenses, keys, refresh_tokens, token_blacklist, webhook_events
- Token-Strategie: Access 7 Tage, Refresh 90 Tage; General-JWT ohne exp mit perm:true und role:admin
- Mollie: Webhook sendet id; Server lädt Payment/Subscription über Mollie API (v2) nach und aktualisiert DB. Idempotenz über webhook_events

Sicherheit
- Nur HTTPS im Betrieb (vor einen TLS-Terminator/Ingress stellen)
- Secrets per Env/Secret-Manager
- Rate Limits und Logs empfohlen

Tests
- Unit-Tests für JWT, Webhook-Idempotenz und Refresh-Flow (Mock-Mollie-Client)
