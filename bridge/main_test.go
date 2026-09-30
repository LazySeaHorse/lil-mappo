package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func newTestBridge() (*bridge, *httptest.Server) {
	b := &bridge{pending: map[int64]chan json.RawMessage{}, origins: defaultOrigins}
	mux := http.NewServeMux()
	mux.HandleFunc("/page", b.handlePage)
	mux.HandleFunc("/mcp", b.handleMCP)
	return b, httptest.NewServer(mux)
}

func rpc(t *testing.T, url, body string, headers map[string]string) (int, map[string]any) {
	t.Helper()
	req, _ := http.NewRequest("POST", url+"/mcp", strings.NewReader(body))
	for k, v := range headers {
		if k == "Host" {
			req.Host = v // Go ignores a Host header set the normal way
		} else {
			req.Header.Set(k, v)
		}
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var out map[string]any
	json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out
}

func TestForwardsCallsToTab(t *testing.T) {
	_, srv := newTestBridge()
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// No tab yet: a tool call fails helpfully and the list is empty.
	_, out := rpc(t, srv.URL, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"x"}}`, nil)
	if out["result"].(map[string]any)["isError"] != true {
		t.Fatalf("expected isError without a tab: %v", out)
	}

	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http")+"/page", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseNow()
	c.Write(ctx, websocket.MessageText, []byte(`{"type":"tools","tools":[{"name":"echo"}]}`))

	go func() { // fake tab: answer every call with its input
		for {
			_, data, err := c.Read(ctx)
			if err != nil {
				return
			}
			var m struct {
				ID    int64           `json:"id"`
				Input json.RawMessage `json:"input"`
			}
			json.Unmarshal(data, &m)
			reply, _ := json.Marshal(map[string]any{"type": "result", "id": m.ID,
				"result": map[string]any{"content": []map[string]any{{"type": "text", "text": string(m.Input)}}}})
			c.Write(ctx, websocket.MessageText, reply)
		}
	}()

	var list map[string]any
	for i := 0; i < 50; i++ { // tools arrive asynchronously
		_, list = rpc(t, srv.URL, `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`, nil)
		if len(list["result"].(map[string]any)["tools"].([]any)) == 1 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if len(list["result"].(map[string]any)["tools"].([]any)) != 1 {
		t.Fatalf("tools not listed: %v", list)
	}

	_, out = rpc(t, srv.URL, `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"echo","arguments":{"a":1}}}`, nil)
	text := out["result"].(map[string]any)["content"].([]any)[0].(map[string]any)["text"]
	if text != `{"a":1}` {
		t.Fatalf("unexpected result: %v", out)
	}
}

func TestRejectsBrowsersAndForeignOrigins(t *testing.T) {
	_, srv := newTestBridge()
	defer srv.Close()

	if code, _ := rpc(t, srv.URL, `{"jsonrpc":"2.0","id":1,"method":"ping"}`, map[string]string{"Origin": "https://evil.example"}); code != 403 {
		t.Fatalf("MCP with Origin: got %d, want 403", code)
	}
	if code, _ := rpc(t, srv.URL, `{"jsonrpc":"2.0","id":1,"method":"ping"}`, map[string]string{"Host": "evil.example"}); code != 403 {
		t.Fatalf("MCP with foreign Host: got %d, want 403", code)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http")+"/page",
		&websocket.DialOptions{HTTPHeader: http.Header{"Origin": {"https://evil.example"}}})
	if err == nil {
		t.Fatal("page connection from a foreign origin was accepted")
	}
}
