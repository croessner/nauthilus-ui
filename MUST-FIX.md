Befunde (priorisiert)

  1. CRITICAL Fehlende Autorisierung (IDOR + Privilege Escalation) in Kern-APIs.
     Angriff: Ein normaler eingeloggter User kann andere User/Profile/Runtime lesen/schreiben/löschen und User mit Admin-Rolle anlegen/ändern/löschen.
     Belege: nauthilus-ui/server/main.go:167, nauthilus-ui/server/main.go:169, nauthilus-ui/server/api/profile.go:279, nauthilus-ui/server/api/profile.go:330, nauthilus-ui/server/
     api/runtime.go:238, nauthilus-ui/server/api/runtime.go:255, nauthilus-ui/server/api/user.go:176, nauthilus-ui/server/api/user.go:312, nauthilus-ui/server/api/user.go:439.
     Empfehlung: Zentrale Middleware requireAdmin für User-/JWT-Config-Management; zusätzlich requireSelfOrAdmin für :userId/:username-Routen.
  2. CRITICAL MFA-Bypass/Account-Takeover durch unsicheren Auth-Flow.
     Angriff: /api/auth/* ist global von JWT-Auth ausgenommen; TOTP/WebAuthn-Endpunkte arbeiten mit frei übergebbarem username; Login vertraut clientseitigem mfaVerified.
     Belege: nauthilus-ui/server/main.go:134, nauthilus-ui/server/api/mfa.go:112, nauthilus-ui/server/api/mfa.go:240, nauthilus-ui/server/api/mfa.go:318, nauthilus-ui/server/api/
     auth.go:80, nauthilus-ui/server/api/auth.go:176, nauthilus-ui/server/api/auth.go:213.
     Empfehlung: MFA nur serverseitig über Challenge-Session binden (kein mfaVerified aus Request akzeptieren), Setup/Disable nur für ctx.username oder Admin erlauben.
  3. CRITICAL JWT-Secret und MFA-Secrets sind auslesbar.
     Angriff: GET /api/jwtconfig liefert Signatur-Secret; User-APIs liefern totpSecret. Damit sind Token-Forgery und MFA-Übernahme möglich.
     Belege: nauthilus-ui/server/api/jwtconfig.go:30, nauthilus-ui/server/api/jwtconfig.go:63, nauthilus-ui/server/models/models.go:86, nauthilus-ui/server/models/models.go:65,
     nauthilus-ui/server/api/user.go:100, nauthilus-ui/server/api/user.go:167.
     Empfehlung: Secrets nie serialisieren (json:"-"), getrennte DB-/API-Modelle, /api/jwtconfig admin-only und Secret nur write-only behandeln.
  4. HIGH Öffentlicher Proxy-Pfad mit SSRF-Charakter (/proxy/oidc-token).
     Angriff: Endpoint ist ohne Auth erreichbar und akzeptiert frei gesetzte Target-URL (url/x-target-url).
     Belege: nauthilus-ui/server/main.go:360, nauthilus-ui/server/proxy/proxy.go:53, nauthilus-ui/server/proxy/proxy.go:57, nauthilus-ui/server/proxy/proxy.go:585, nauthilus-ui/
     server/proxy/proxy.go:645.
     Empfehlung: Endpoint auth-pflichtig machen oder strikt auf Allowlist (Schema+Host+Port) begrenzen; private Netze/DNS-Rebinding blockieren.
  5. HIGH Sensitive Daten in Query-Strings und Logs.
     Angriff: authType/authValue (inkl. Bearer/Basic) werden als URL-Parameter übertragen und in Request-/Proxy-/Audit-Logs geschrieben.
     Belege: nauthilus-ui/src/contexts/ConfigContext.tsx:946, nauthilus-ui/src/utils/apiUtils.ts:77, nauthilus-ui/server/proxy/proxy.go:204, nauthilus-ui/server/proxy/proxy.go:305,
     nauthilus-ui/server/middleware/logger.go:25, nauthilus-ui/server/middleware/jwt.go:64, nauthilus-ui/server/middleware/jwt.go:68.
     Empfehlung: Auth nur per Header, nie per Query; Log-Redaction für Authorization, Cookies, Query-Keys wie authValue, token.
  6. HIGH OIDC-Tokens in URL + JS-Cookies (nicht HttpOnly).
     Angriff: Tokens kommen als Query (/oidc/callback?...) und werden im Browser per JS-Cookie gesetzt. Leck über History/Referer/Logs, plus XSS-exfiltration.
     Belege: nauthilus-ui/server/api/oidc.go:373, nauthilus-ui/src/components/OIDCCallback.tsx:26, nauthilus-ui/src/components/OIDCCallback.tsx:38.
     Empfehlung: Tokens ausschließlich serverseitig via SetAuthCookies setzen und ohne Token-Query auf / redirecten.
  7. MEDIUM-HIGH CORS ist origin-reflektierend mit Allow-Credentials=true.
     Angriff: Bei zukünftigen Cookie-/Header-Änderungen sofort kritisch; aktuell bereits zu weit offen.
     Belege: nauthilus-ui/server/middleware/cors.go:40, nauthilus-ui/server/middleware/cors.go:44, nauthilus-ui/server/main.go:337, nauthilus-ui/server/main.go:346, nauthilus-ui/
     server/proxy/proxy.go:557.
     Empfehlung: Harte Allowlist aus Config, Vary: Origin, kein Reflection-Fallback.
  8. MEDIUM CSRF-Schutz ist nicht systematisch implementiert.
     Ist: OIDC state existiert nur für OIDC-Flow.
     Belege: nauthilus-ui/server/api/oidc.go:93, nauthilus-ui/server/api/oidc.go:127.
     Fehlt: generelle CSRF-Validierung (Origin/Referer + CSRF-Token) auf state-changing Endpunkten.
     Empfehlung: Für cookie-authentisierte mutierende Requests Origin/Referer strikt prüfen + Double-Submit/CSRF-Token.
  9. MEDIUM CSP/Headers-Hardening fehlt weitgehend.
     Ist: nur minimale Permissions-Policy.
     Belege: nauthilus-ui/server/middleware/static.go:36, nauthilus-ui/index.html:14.
     Empfehlung:

  - Content-Security-Policy mit Nonce (script-src 'self' 'nonce-...') oder Inline-Script entfernen.
  - Zusätzlich: Strict-Transport-Security, X-Content-Type-Options: nosniff, Referrer-Policy, frame-ancestors 'none' (oder X-Frame-Options), Cross-Origin-Opener-Policy, Cross-Origin-
    Resource-Policy.

  10. MEDIUM Untrusted X-Forwarded-* Nutzung in sicherheitsrelevanter Logik.
     Angriff: Host/Proto-Manipulation in OIDC/WebAuthn-Flows, IP-Spoofing in Audit/Rate-Limit-Kontext möglich (abhängig von Proxy-Setup).
     Belege: nauthilus-ui/server/api/oidc.go:38, nauthilus-ui/server/api/mfa.go:493, nauthilus-ui/server/api/audit.go:272, nauthilus-ui/server/api/middleware.go:216.
     Empfehlung: Trusted-Proxy-Konzept sauber konfigurieren, Forwarded-Header nur von vertrauenswürdigen Proxies akzeptieren.
  11. MEDIUM Potenzielle Stored-XSS-Fläche in Legal-Rendering.
     Angriff: Markdown wird als HTML gerendert und via dangerouslySetInnerHTML injiziert.
     Belege: nauthilus-ui/src/components/LegalPage.tsx:154, nauthilus-ui/src/components/LegalPage.tsx:203.
     Empfehlung: HTML-Sanitizing (z. B. DOMPurify) vor Rendern + strikte CSP.

  CSRF/CSP konkret (Ist/Soll)

  - Ist: Cookie SameSite=Lax für Auth-Cookies vorhanden (nauthilus-ui/server/api/cookies.go:28), aber kein globaler CSRF-Validator.
  - Soll CSRF: Origin/Referer prüfen + CSRF-Token für mutierende Requests mit Cookie-Auth.
  - Ist CSP: keine robuste CSP, Inline-Script vorhanden (nauthilus-ui/index.html:14).
  - Soll CSP: Nonce-basierte CSP oder Inline-Script komplett eliminieren.

  Empfohlene Reihenfolge für Umsetzung

  1. Autorisierungslücken + Secret-Leaks schließen (Punkte 1-3).
  2. MFA-Flow serverseitig härten, mfaVerified entfernen (Punkt 2).
  3. OIDC-Token-Handling und Proxy-SSRF fixen (Punkte 4-6).
  4. Danach CORS/CSRF/CSP/Header-Hardening (Punkte 7-9).
  5. Zum Schluss Forwarded-Header-Vertrauen und XSS-Härtung (Punkte 10-11).
