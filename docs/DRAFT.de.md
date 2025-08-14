# DRAFT: Teil-Lizenzierung (SaaS) mit eigenem Lizenz-Server und Mollie-Abos

Stand: 2025-08-14

Ziel: Einführung einer Lizenzierung nur für bestimmte Funktionsbereiche (Download-Button und Runtime-Bereich) mittels eines separaten Lizenz-Servers, der mit Mollie für Abonnements interagiert. Lizenzen werden als JWT ausgegeben, können im Frontend eingetragen werden, unterstützen Verlängerung/Refresh bei laufendem Abo sowie ein administratives „General‑JWT“ ohne Ablauf.

Hinweis zu „valide Informationen“: Alle produkt- und API-bezogenen Aussagen unten entsprechen dem öffentlichen Stand der Mollie-API-Dokumentation und üblichen JWT-Standards. Zu Mollie siehe: https://docs.mollie.com/


## 1) Überblick & Architektur

- Komponenten
  - Lizenz‑Server (neuer, separater Dienst; NICHT das bestehende Go‑Backend)
  - Mollie (Payments, Mandates, Subscriptions, Webhooks)
  - UI/Frontend (dieses Repository)
  - Optional: vorhandenes Go‑Backend bleibt unverändert; der Lizenz‑Server ist unabhängig und bietet eigene Endpunkte.

- High-Level-Flow
  1. Kunde legt Abo an (über Checkout/Onboarding‑Flow). Für wiederkehrende Zahlungen ist bei Mollie eine Mandate/SEPA/… erforderlich.
  2. Mollie initiiert für Zahlungen Webhook‑Aufrufe an unseren Lizenz‑Server. Der Lizenz‑Server validiert den Webhook, ruft dazu die Mollie‑API auf, prüft Status und aktualisiert den lokalen Abo-/Lizenzstatus.
  3. Der Lizenz‑Server stellt Lizenz‑JWTs aus (kurzlebig) und bei Bedarf Refresh‑Tokens.
  4. Frontend bietet Eingabefeld für Lizenz‑JWT und speichert dieses lokal (z. B. localStorage). Bereiche Download/Runtime werden nur freigeschaltet, wenn ein gültiges JWT mit entsprechender Lizenz vorliegt.
  5. Periodisch oder bei App‑Start fragt das Frontend beim Lizenz‑Server (mit Refresh‑Token oder bestehendem JWT) eine Verlängerung an. Der Lizenz‑Server prüft anhand des Abo‑Status (aus DB, von Webhooks gepflegt bzw. via Mollie‑API), stellt bei gültigem Abo ein frisches Lizenz‑JWT aus.
  6. Admin kann manuell ein „General‑JWT“ (permanent) erzeugen und verteilen.


## 2) Mollie – relevante Fakten (Stand 2025)

- Grundlegend
  - Mollie unterstützt wiederkehrende Zahlungen (Recurring) über Mandates. Siehe: https://docs.mollie.com/payments/recurring
  - Ein initialer Payment‑Flow erstellt/aktualisiert die Mandate; danach können Subscriptions angelegt werden: https://docs.mollie.com/reference/v2/subscriptions-api/create-subscription

- Subscriptions
  - Status von Subscriptions (Stand Doku): `active`, `pending`, `canceled`, `suspended`, `completed`.
  - Für wiederkehrende Abbuchungen erzeugt Mollie Zahlungen, zu denen Webhooks abgesetzt werden.

- Payments & Webhooks
  - Mollie ruft unsere Webhook‑URL per POST auf und sendet dabei eine Ressource‑ID (z. B. `id=tr_xxx` für Payments) in der Form `application/x-www-form-urlencoded` oder JSON (abhängig von Implementierung und Headern). Siehe: https://docs.mollie.com/overview/webhooks
  - Es wird bei Webhooks kein HMAC‑Signatur‑Header bereitgestellt (im Gegensatz zu manchen anderen PSPs). Die Validierung erfolgt dadurch, dass unser Server die erhaltene ID über die Mollie‑API (mit unserem API‑Key) nachlädt und den Status prüft: https://docs.mollie.com/overview/webhooks#securing-your-webhook-endpoint
  - Relevante Payment‑Status: `paid`, `authorized` (selten je nach Zahlungsmittel), `open`, `pending`, `failed`, `canceled`, `expired`, `refunded`, `charged_back`. Für Lizenzen ist in der Regel `paid` ausschlaggebend.

- Kunden-/Subskriptionsbezug
  - Empfohlen ist die Nutzung von `metadata` an Payments/Subscriptions, um unsere interne Benutzer-/Lizenz-ID zu referenzieren. Siehe: https://docs.mollie.com/overview/metadata


## 3) Lizenz-Server – Design

- Anforderungen
  - Eigenständiger Service mit Datenbank (z. B. PostgreSQL oder MongoDB). Enthält Tabellen/Collections für Benutzer, Abos, Lizenz‑Zustände, Token‑Blacklist (optional), kryptographische Schlüsselverwaltung (Signierschlüssel), Audit‑Logs.
  - Erzeugt und verifiziert JWTs (RS256 empfohlen). Private Keys bleiben auf dem Lizenz‑Server. Public Keys werden als JWKS veröffentlicht.
  - Bietet Endpunkte für: Onboarding/Checkout (optional), Webhook‑Handler, Token‑Ausstellung/Refresh, Lizenz‑Validierung, Admin‑Funktionen (z. B. General‑JWT ausstellen), JWKS.

- JWT-Format (Lizenz‑JWT)
  - Algorithmen: RS256.
  - Claims (Vorschlag):
    - `iss`: Lizenz‑Server‑Issuer‑URL (z. B. `https://license.example.com`)
    - `sub`: interne User‑ID
    - `lic`: Objekt mit Lizenzattributen, z. B. `{ download: true, runtime: true }`
    - `scope`: String oder Array (z. B. `download runtime`)
    - `exp`: Ablauf (kurzlebig, z. B. 7 Tage)
    - `iat`, `nbf`
    - `jti`: Token‑ID
    - `plan`: Tarif/Produktkennung
    - `subscriptionId`: Mollie‑Subscription‑ID (falls vorhanden)
    - `entitlements`: optionale Liste mit granularen Rechten
  - Signatur: RS256 mit aktuellem Private Key; `kid` Header für Key‑Rotation.

- General‑JWT (Admin, „ohne Ablauf“)
  - Aus Sicherheitsgründen sollte „ohne Ablauf“ bewusst und explizit markiert sein. Optionen:
    1) `exp` weglassen und zusätzlich Claim `perm: true` plus `role: admin` setzen. Die Validierer akzeptieren „permanent“ nur, wenn beide Bedingungen erfüllt sind und der Token aus dem Admin‑Endpunkt stammt.
    2) Alternativ extrem lange Laufzeit (z. B. 30 Jahre). Der Wunsch ist „ohne Ablauf“ – daher Option 1.
  - Zusätzliche Schutzmaßnahmen: Ausgabe nur für dedizierte Admins, Audit‑Log, Möglichkeit der manuellen Revocation (Blacklist per `jti`).

- JWKS (Public Keys)
  - Endpoint: `GET /.well-known/jwks.json` mit allen aktiven Public Keys. Frontend/andere Dienste können damit offline verifizieren.

- Schlüsselrotation
  - Halte mindestens 2 aktive Schlüsselpaare in Rotation.
  - Turnus z. B. alle 3–6 Monate.
  - Alte Keys in JWKS belassen, bis alle kurzlebigen Tokens abgelaufen sind.

- Datenmodell (minimal)
  - `users`: id, email, createdAt, status
  - `subscriptions`: id, userId, mollieCustomerId, mollieSubscriptionId, planId, status, currentPeriodEnd, createdAt, updatedAt
  - `licenses`: userId, entitlements (download/runtime), lastIssuedAt, validUntil, source (subscription/admin)
  - `keys`: kid, publicKey, privateKey (sicher gespeichert), createdAt, active, rotatedAt
  - `token_blacklist` (optional für Revocation): jti, reason, createdAt
  - `webhook_events`: rawPayloadHash, resourceId, type, processedAt, result


## 4) Lizenz-Server – Endpunkte (API)

- Öffentliche Endpunkte
  - `GET /.well-known/jwks.json`: JWKS mit aktiven Public Keys.
  - `POST /api/license/validate` (optional): Validierung eines JWT (Server-seitig), Antwort: gültig/ungültig + Claims (Debug/Support).

- Lizenz-Flow Endpunkte
  - `POST /api/auth/token` – Ausgabe eines Lizenz‑JWT auf Basis eines gültigen Refresh‑Tokens oder Admin‑Credentials.
    - Request: `{ refresh_token?: string }` oder Admin‑Auth (siehe Admin-Endpunkte).
    - Antwort: `{ access_token: <JWT>, expires_in: <sec>, refresh_token?: <token> }`.
  - `POST /api/auth/refresh` – Erneuerung über Refresh‑Token.
  - `POST /api/license/redeem` – Optional: Einlösen eines vom Checkout generierten Codes/Links, Zuordnung User↔Abo.

- Mollie Webhook Endpoint
  - `POST /api/webhooks/mollie`
    - Erwartet ID (z. B. Payment‑ID). Server lädt über Mollie‑API den Payment‑Datensatz und validiert Status/Metadata.
    - Aktualisiert DB: Abo‑Status, nächste Periode, Entitlements.
    - Idempotent (mehrfach aufrufbar, keine doppelten Effekte).

- Admin Endpunkte (gesichert, z. B. via mTLS oder OIDC Admin‑Login)
  - `POST /api/admin/license/general` – erzeugt General‑JWT (permanent) für definierten Scope/Nutzer/Gruppe.
  - `POST /api/admin/keys/rotate` – Schlüsselrotation anstoßen.
  - `POST /api/admin/token/revoke` – jti auf Blacklist setzen.


## 5) Mollie-Integration – Implementierungsschritte

1) Konto/PSP‑Vorbereitung
   - Mollie‑Account, Live- und Test-API‑Keys verwalten. API‑Keys sicher speichern (z. B. in Secret Manager). Siehe: https://docs.mollie.com/overview/authentication

2) Kunden- und Mandatsanlage
   - Erzeugen eines Customers: https://docs.mollie.com/reference/v2/customers-api/create-customer
   - Initialen Payment‑Flow starten, damit ein Mandate erstellt wird (je nach Zahlart). Payment mit `sequenceType` = `first`. https://docs.mollie.com/reference/v2/payments-api/create-payment
   - `metadata` setzen: interne userId, planId.

3) Subscription anlegen
   - Nach erfolgreichem Erstpayment/Mandat eine Subscription erstellen: https://docs.mollie.com/reference/v2/subscriptions-api/create-subscription
   - Ebenfalls `metadata` mitführen (userId, planId). Eine `amount`, `interval`, `startDate` etc. definieren.

4) Webhook implementieren
   - `POST /api/webhooks/mollie` registrieren (URL in Mollie‑Dashboard hinterlegen oder pro Payment/Subscription setzen).
   - Bei Webhook: `id` auslesen; per Mollie‑API (mit unserem API‑Key) Payment/Subscription abrufen und Status prüfen. Beispiele:
     - Payment laden: https://docs.mollie.com/reference/v2/payments-api/get-payment
     - Subscription laden: https://docs.mollie.com/reference/v2/subscriptions-api/get-subscription
   - Auf Basis von `status` die DB aktualisieren: Bei `paid` die Periode verlängern bzw. Subscription auf `active` bestätigen; bei `canceled`/`suspended` entsprechend entziehen.
   - Idempotenz sicherstellen (Unique Constraint pro Event‑ID oder Hash).

5) Lizenzableitungen
   - Entitlements (download/runtime) aus Plan/Zuweisung ableiten und in der DB für den User persistieren.


## 6) Token-Strategie (Access + Refresh)

- Access‑Token (Lizenz‑JWT)
  - Kurzlebig (z. B. 7 Tage). Begründung: erleichtert Key‑Rotation und Sperrung.
  - Wird im Frontend gespeichert (localStorage) und bei jedem Request, der Lizenzpflichtiges triggert, als `Authorization: Bearer` übertragen (falls es dort Backends gibt), oder nur lokal geprüft für UI‑Freischaltungen.

- Refresh‑Token
  - Länger lebig (z. B. 90 Tage, rotierend). Server‑seitig als Hash speichern. Bindung an User und Client.
  - Endpoint `/api/auth/refresh` stellt neues Access‑Token aus, wenn Abo aktiv ist.

- Grace‑Period
  - Optional 3–7 Tage Kulanz bei Abrechnungsproblemen (z. B. `pending`). Policy abhängig vom Business‑Wunsch. Umsetzung: zusätzliche Claim/Server‑Logik.

- Revocation
  - Blacklist nach `jti` oder Dreh des Signing‑Keys (global). Für Einzelwiderrufe bevorzugt Blacklist.


## 7) Frontend-Integration (dieses Repo)

- UX
  - „Lizenz eingeben“-Dialog/Seite: Eingabefeld für JWT, Validierung (Syntax, Ablauf) und Anzeige der Entitlements/Status.
  - Buttons/Runtime nur rendern/aktivieren, wenn gültige Lizenz mit entsprechenden Rechten vorliegt.

- Speicherung
  - Persistenz in `localStorage` (Schlüssel: `license.jwt`) oder `IndexedDB`. Nur JWT, kein Refresh‑Token im Klartext, wenn möglich. Für Komfort kann Refresh‑Token clientseitig gehalten werden; ist ein Trade‑off.

- Prüfung
  - Client‑seitig: JWT decodieren (ohne Geheimnis), `exp` prüfen, `iss`, `kid` und `aud` (falls gesetzt) prüfen. Public Keys per JWKS vom Lizenz‑Server laden und Signatur verifizieren (optional clientseitig, abhängig von Bundle‑Größe; ansonsten beim Server prüfen, wenn Requests ohnehin serverseitig gehen).
  - Serverseitig: Nicht vertrauen, Entscheidungen serverseitig absichern, wenn ein eigener Backend‑Call nötig ist (z. B. für Download aus Backend).

- Refresh-Flow im Frontend
  - Beim App‑Start und zyklisch vor Ablauf (`exp`) `/api/auth/refresh` aufrufen.
  - Bei Fehlschlag: Lizenz als „abgelaufen“ markieren; UI zeigt Hinweis.


## 8) Sicherheit & Compliance

- Transport: Nur HTTPS. HSTS aktivieren.
- Secrets: API‑Keys und Private Keys in Secret‑Manager. Kein Check‑in in Repos.
- Zeit: NTP/Time‑Sync sicherstellen (JWT `exp`/`nbf`).
- Rate‑Limit/Bruteforce‑Schutz für Auth/Refresh.
- Audit‑Logs: Admin‑Aktionen, Token‑Ausstellungen, Webhook‑Ereignisse.
- Datenschutz (EU/GDPR): Minimaldaten in `metadata`, DPA mit Mollie, Aufbewahrungsfristen.
- Backup/Restore der DB und Keys. Notfallplan für Key‑Compromise (Rotation, Revocation, Forcerefresh).


## 9) Schritt-für-Schritt Implementierung

1) Infrastruktur & Grundlagen
   - Repository für Lizenz‑Server anlegen (separat).
   - CI/CD, Secrets‑Speicher, Datenbank bereitstellen.

2) Schlüsselverwaltung
   - RS256 Schlüsselpaar generieren, sicher ablegen. JWKS‑Endpoint implementieren.

3) DB‑Schema & Modelle
   - Tabellen/Collections erstellen: users, subscriptions, licenses, keys, webhook_events, token_blacklist.

4) Mollie‑Client
   - HTTP‑Client inkl. Retry/Timeout. API‑Key aus Secrets. Endpunkte für Payments/Subscriptions.

5) Webhook‑Endpoint
   - `POST /api/webhooks/mollie` implementieren, Validierung: Payment/Subscription nachladen, Status prüfen, DB aktualisieren, idempotent.

6) Token‑Endpunkte
   - `POST /api/auth/token` und `/api/auth/refresh` implementieren. Ausgabe von Access‑Token (JWT, 7 Tage) und Refresh‑Token (90 Tage, Rotation).

7) Admin‑Endpunkte
   - `POST /api/admin/license/general`: General‑JWT mit `perm: true`, `role: admin`, ohne `exp`.
   - `POST /api/admin/token/revoke`, `POST /api/admin/keys/rotate`.

8) Frontend‑Anpassungen (in diesem Repo)
   - Lizenz‑Eingabe UI, lokale Speicherung, Anzeige Entitlements.
   - UI‑Gates für Download/Runtime.
   - Optional: JWKS‑basierte Verifikation clientseitig oder serverseitig abgesichert.
   - Refresh‑Timer/Hook.

9) Tests
   - Unit‑Tests für JWT, Webhook‑Parser, Statusübergänge.
   - Integrationstests gegen Mollie Sandbox (Test‑Keys) mit simulierten Webhooks.
   - E2E: Checkout → Webhook → Lizenz aktiv → Refresh.

10) Monitoring & Betrieb
   - Metrics (Webhook Latenzen, Token‑Ausgaben), Logs, Alarme (fehlgeschlagene Webhooks, abgelaufene Keys).


## 10) Entscheidungsdetails (Policies)

- Entitlements
  - Plan → `download` und/oder `runtime`. Mapping in Server‑Konfiguration.

- Grace‑Period
  - Empfohlen 3 Tage.

- Token-Laufzeiten
  - Access: 7 Tage; Refresh: 90 Tage; Admin‑General: permanent (`perm: true`, kein `exp`).

- Widerruf
  - Blacklist auf `jti`. Admin‑UI bietet Widerrufsfunktion.


## 11) Beispiel: JWT-Header & Payload

Header:
```
{
  "alg": "RS256",
  "kid": "2025-06-k1",
  "typ": "JWT"
}
```

Payload (normale Lizenz):
```
{
  "iss": "https://license.example.com",
  "sub": "user_123",
  "lic": { "download": true, "runtime": true },
  "scope": "download runtime",
  "plan": "pro-monthly",
  "subscriptionId": "sub_ABC123",
  "iat": 1755177600,
  "nbf": 1755177600,
  "exp": 1755782400,
  "jti": "a2f3e..."
}
```

Payload (Admin General‑JWT):
```
{
  "iss": "https://license.example.com",
  "sub": "admin",
  "role": "admin",
  "perm": true,
  "lic": { "download": true, "runtime": true },
  "scope": "*",
  "iat": 1755177600,
  "nbf": 1755177600,
  "jti": "adm-..."
}
```


## 12) Abnahmecheckliste

- [ ] Mollie Sandbox‑Flow: Customer → Payment (paid) → Subscription (active)
- [ ] Webhook verarbeitet Payment‑Event idempotent
- [ ] Lizenzstatus in DB korrekt abgeleitet
- [ ] JWT‑Ausstellung korrekt signiert (RS256), JWKS erreichbar
- [ ] Frontend kann JWT eingeben, speichert es, schaltet Download/Runtime nur mit gültiger Lizenz frei
- [ ] Refresh funktioniert, wenn Subscription aktiv
- [ ] General‑JWT erzeugbar, wird akzeptiert, Revocation möglich
- [ ] Schlüsselrotation ohne Ausfall
- [ ] Monitoring/Alarme vorhanden


## 13) Referenzen (Mollie)

- Authentication: https://docs.mollie.com/overview/authentication
- Webhooks: https://docs.mollie.com/overview/webhooks
- Metadata: https://docs.mollie.com/overview/metadata
- Customers API: https://docs.mollie.com/reference/v2/customers-api/create-customer
- Payments API: https://docs.mollie.com/reference/v2/payments-api/create-payment
- Get Payment: https://docs.mollie.com/reference/v2/payments-api/get-payment
- Subscriptions API: https://docs.mollie.com/reference/v2/subscriptions-api/create-subscription
- Get Subscription: https://docs.mollie.com/reference/v2/subscriptions-api/get-subscription


## 14) Hinweise zur Umsetzungssprache

- Der Lizenz‑Server kann in einer beliebigen Sprache implementiert werden (Node.js, Go, etc.). Wegen der Unabhängigkeit vom bestehenden Go‑Backend ist eine eigene Codebasis erforderlich.

Ende des Drafts.
