package api

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"os/exec"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

// ReportHandler provides endpoints for server-side report generation (PDF)
type ReportHandler struct {
	mongo *db.MongoDB
}

// NewReportHandler creates a new ReportHandler
func NewReportHandler(mongo *db.MongoDB) *ReportHandler {
	return &ReportHandler{mongo: mongo}
}

// RegisterRoutes registers the report routes
func (h *ReportHandler) RegisterRoutes(r *gin.Engine) {
	api := r.Group("/api")
	api.POST("/report/pdf", h.GeneratePDF)
}

// pdfRequest is the expected request body for PDF generation
type pdfRequest struct {
	HTML         string  `json:"html"`
	FileName     string  `json:"filename"`
	Landscape    bool    `json:"landscape"`
	MarginTop    float64 `json:"marginTop"`
	MarginBottom float64 `json:"marginBottom"`
	MarginLeft   float64 `json:"marginLeft"`
	MarginRight  float64 `json:"marginRight"`
}

// GeneratePDF renders the provided HTML into a PDF using headless Chromium
func (h *ReportHandler) GeneratePDF(ctx *gin.Context) {
	var req pdfRequest

	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"error": "invalid request body", "details": err.Error()})
		return
	}

	if req.HTML == "" {
		ctx.JSON(400, gin.H{"error": "html is required"})
		return
	}

	filename := req.FileName
	if filename == "" {
		filename = fmt.Sprintf("clickhouse-report-%d.pdf", time.Now().Unix())
	}

	// Audit log (best-effort)
	if h.mongo != nil && h.mongo.IsConnectedToMongoDB() {
		WriteAudit(ctx, h.mongo, models.AuditLogEntry{
			Action:  "report.generate_pdf",
			Details: map[string]any{"filename": filename},
		})
	}

	// Resolve Chrome/Chromium executable path
	findBrowser := func() (string, error) {
		if p := os.Getenv("CHROME_PATH"); p != "" {
			if _, err := os.Stat(p); err == nil {
				return p, nil
			}
		}

		candidates := []string{"google-chrome", "google-chrome-stable", "chromium-browser", "chromium"}
		for _, name := range candidates {
			if p, err := exec.LookPath(name); err == nil {
				return p, nil
			}
		}

		return "", errors.New("no Chrome/Chromium executable found; set CHROME_PATH or install chromium/google-chrome")
	}

	exePath, err := findBrowser()
	if err != nil {
		slog.Error("browser not found for PDF export", "error", err)
		ctx.JSON(500, gin.H{"error": "browser not found for PDF export", "details": err.Error()})
		return
	}

	// Create an ExecAllocator with explicit flags suitable for containers
	allocOpts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath(exePath),
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("hide-scrollbars", true),
		chromedp.Flag("mute-audio", true),
	)

	allocCtx, cancelAlloc := chromedp.NewExecAllocator(ctx.Request.Context(), allocOpts...)
	defer cancelAlloc()

	// Prepare chromedp context
	cctx, cancel := chromedp.NewContext(allocCtx)
	defer cancel()

	// Increase timeout for heavy reports
	cctx, cancel = context.WithTimeout(cctx, 45*time.Second)
	defer cancel()

	// Use a data URL to load the HTML without external network access
	dataURL := "data:text/html;charset=utf-8," + url.PathEscape(req.HTML)

	var pdfBuf []byte

	tasks := chromedp.Tasks{
		chromedp.Navigate(dataURL),
		// Small delay to let client-side charts settle if present
		chromedp.Sleep(700 * time.Millisecond),
		chromedp.ActionFunc(func(c context.Context) error {
			p := page.PrintToPDF().
				WithLandscape(req.Landscape).
				WithPrintBackground(true).
				WithPreferCSSPageSize(true)
			// Margins in inches (Chromium expects inches). If margins are not provided,
			// let @page CSS decide due to PreferCSSPageSize(true).
			if req.MarginTop > 0 {
				p = p.WithMarginTop(req.MarginTop)
			}

			if req.MarginBottom > 0 {
				p = p.WithMarginBottom(req.MarginBottom)
			}

			if req.MarginLeft > 0 {
				p = p.WithMarginLeft(req.MarginLeft)
			}

			if req.MarginRight > 0 {
				p = p.WithMarginRight(req.MarginRight)
			}

			res, _, err := p.Do(c)
			if err != nil {
				return err
			}

			pdfBuf = res

			return nil
		}),
	}

	if err := chromedp.Run(cctx, tasks); err != nil {
		slog.Error("chromedp failed to render PDF", "error", err)
		ctx.JSON(500, gin.H{"error": "failed to render pdf", "details": err.Error()})

		return
	}

	ctx.Header("Content-Type", "application/pdf")
	ctx.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	ctx.Data(200, "application/pdf", pdfBuf)
}
