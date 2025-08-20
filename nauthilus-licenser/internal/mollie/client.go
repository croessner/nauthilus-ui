package mollie

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Client interface {
	GetPayment(ctx context.Context, id string) (*Payment, error)
	GetSubscription(ctx context.Context, customerID, subID string) (*Subscription, error)
}

type client struct {
	apiKey string
	h     *http.Client
}

func NewClient(apiKey string) Client {
	return &client{
		apiKey: apiKey,
		h: &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *client) do(ctx context.Context, method, url string, v any) error {
	req, _ := http.NewRequestWithContext(ctx, method, url, nil)
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Accept", "application/json")
	resp, err := c.h.Do(req)
	if err != nil { return err }
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("mollie http %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(v)
}

func (c *client) GetPayment(ctx context.Context, id string) (*Payment, error) {
	var p Payment
	err := c.do(ctx, http.MethodGet, fmt.Sprintf("https://api.mollie.com/v2/payments/%s", id), &p)
	if err != nil { return nil, err }
	return &p, nil
}

func (c *client) GetSubscription(ctx context.Context, customerID, subID string) (*Subscription, error) {
	var s Subscription
	err := c.do(ctx, http.MethodGet, fmt.Sprintf("https://api.mollie.com/v2/customers/%s/subscriptions/%s", customerID, subID), &s)
	if err != nil { return nil, err }
	return &s, nil
}

type Payment struct {
	ID       string          `json:"id"`
	Status   string          `json:"status"`
	Amount   json.RawMessage `json:"amount"`
	Metadata json.RawMessage `json:"metadata"`
	CustomerID string        `json:"customerId"`
}

type Subscription struct {
	ID       string          `json:"id"`
	Status   string          `json:"status"`
	Amount   json.RawMessage `json:"amount"`
	Metadata json.RawMessage `json:"metadata"`
}
