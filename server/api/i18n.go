package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

// I18nHandler serves simple i18n payloads that don't require authentication
// Currently used by the Cookie Consent banner so it can show before login.
type I18nHandler struct{}

func NewI18nHandler() *I18nHandler { return &I18nHandler{} }

// RegisterRoutes registers public i18n endpoints on the root router (unprotected)
func (h *I18nHandler) RegisterRoutes(router *gin.Engine) {
	// Cookie consent translations
	router.GET("/api/i18n/cookie-consent", h.GetCookieConsent)
}

// defaultPayload returns the built-in translations as a safe fallback
func (h *I18nHandler) defaultPayload() map[string]map[string]string {
	return map[string]map[string]string{
		"en": {"text": "We use strictly necessary cookies required to operate this application.", "privacyLinkText": "Privacy Policy", "ok": "OK"},
		"de": {"text": "Wir setzen technisch notwendige Cookies ein, die für den Betrieb dieser Anwendung erforderlich sind.", "privacyLinkText": "Datenschutzerklärung", "ok": "OK"},
		"fr": {"text": "Nous utilisons des cookies strictement nécessaires au fonctionnement de cette application.", "privacyLinkText": "Politique de confidentialité", "ok": "OK"},
		"es": {"text": "Utilizamos cookies estrictamente necesarias para el funcionamiento de esta aplicación.", "privacyLinkText": "Política de privacidad", "ok": "OK"},
		"it": {"text": "Utilizziamo cookie strettamente necessari al funzionamento di questa applicazione.", "privacyLinkText": "Informativa sulla privacy", "ok": "OK"},
		"nl": {"text": "We gebruiken strikt noodzakelijke cookies die nodig zijn voor het functioneren van deze applicatie.", "privacyLinkText": "Privacybeleid", "ok": "OK"},
		"pl": {"text": "Używamy ciasteczek niezbędnych do działania tej aplikacji.", "privacyLinkText": "Polityka prywatności", "ok": "OK"},
	}
}

// readPayloadFromFile attempts to read translations from common file locations.
// It returns the parsed payload and true on success; otherwise nil, false.
func (h *I18nHandler) readPayloadFromFile() (map[string]map[string]string, bool) {
	candidatePaths := []string{
		"./config/cookie-consent.json",       // typical runtime config (Docker/current dir)
		"../config/cookie-consent.json",      // dev run from server/ directory
		"./cookie-consent.json",              // optional direct drop-in
		"./src/locales/cookie-consent.json",  // dev fallback when running from repo root build
		"../src/locales/cookie-consent.json", // dev fallback when running from server/
	}

	for _, p := range candidatePaths {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}

		var payload map[string]map[string]string
		if err := json.Unmarshal(data, &payload); err != nil {
			slog.Warn("Invalid cookie-consent translations JSON", "path", p, "error", err)

			continue
		}

		// minimal validation: ensure each entry has the expected keys if present
		valid := true
		for lang, m := range payload {
			if m == nil {
				valid = false

				break
			}

			if _, ok := m["text"]; !ok {
				slog.Warn("Missing 'text' in cookie-consent translation", "lang", lang, "path", p)
				valid = false

				break
			}

			if _, ok := m["privacyLinkText"]; !ok {
				slog.Warn("Missing 'privacyLinkText' in cookie-consent translation", "lang", lang, "path", p)
				valid = false

				break
			}

			if _, ok := m["ok"]; !ok {
				slog.Warn("Missing 'ok' in cookie-consent translation", "lang", lang, "path", p)
				valid = false

				break
			}
		}

		if !valid {
			continue
		}

		slog.Info("Loaded cookie-consent translations from file", "path", p)

		return payload, true
	}

	return nil, false
}

// GetCookieConsent returns translations for the cookie consent banner.
// It first attempts to load them from a JSON file located in common paths; if unavailable
// or invalid, it falls back to a compiled default payload.
func (h *I18nHandler) GetCookieConsent(ctx *gin.Context) {
	if payload, ok := h.readPayloadFromFile(); ok {
		ctx.JSON(http.StatusOK, payload)

		return
	}

	ctx.JSON(http.StatusOK, h.defaultPayload())
}
