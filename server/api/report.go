package api

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
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

	// Prepare chromedp context
	cctx, cancel := chromedp.NewContext(ctx.Request.Context())
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
