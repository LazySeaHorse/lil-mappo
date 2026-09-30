// lil-mappo-bridge lets local coding agents (Claude Code, Codex, Gemini CLI,
// ...) use the lil' Mappo tab that is open in your browser.
//
//	agent --MCP over HTTP--> bridge <--WebSocket-- app tab
//
// The bridge holds no tool logic. It forwards tools/list and tools/call to the
// tab, which registers its tools over the WebSocket and executes the calls.
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

var version = "dev"

const (
	callTimeout     = 2 * time.Minute
	statusReplaced  = websocket.StatusCode(4000) // keep in sync with src/agent/bridge.ts
	maxPageMessage  = 128 << 20                  // render_frames returns base64 images
	maxRequestBytes = 4 << 20
	notConnected    = "The lil' Mappo app is not connected. Open it in your browser, sign in, and turn on AI control in the AI panel."
)

// Pages allowed to connect, on top of any localhost dev server.
var defaultOrigins = []string{"app.lilmappo.tech", "mappo.lazycatto.tech", "localhost:*", "127.0.0.1:*"}

type bridge struct {
	mu      sync.Mutex
	page    *websocket.Conn
	tools   json.RawMessage // last tool list; kept across reconnects so agents can list while the tab is away
	pending map[int64]chan json.RawMessage
	nextID  int64
	origins []string
}

func errResult(msg string) json.RawMessage {
	b, _ := json.Marshal(map[string]any{
		"content": []map[string]string{{"type": "text", "text": msg}},
		"isError": true,
	})
	return b
}

// ---- page side (WebSocket) ----

func (b *bridge) handlePage(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: b.origins})
	if err != nil {
		log.Printf("rejected page connection from origin %q (start with -origin <host> to allow it)", r.Header.Get("Origin"))
		return
	}
	c.SetReadLimit(maxPageMessage)

	b.mu.Lock()
	old := b.page
	b.page = c
	b.mu.Unlock()
	if old != nil {
		old.Close(statusReplaced, "another tab connected")
	}

	defer func() {
		b.mu.Lock()
		if b.page == c {
			b.page = nil
			for id, ch := range b.pending {
				select {
				case ch <- errResult("The app tab disconnected before the tool finished."):
				default:
				}
				delete(b.pending, id)
			}
			log.Println("app disconnected")
		}
		b.mu.Unlock()
		c.CloseNow()
	}()

	for {
		_, data, err := c.Read(context.Background())
		if err != nil {
			return
		}
		var m struct {
			Type   string          `json:"type"`
			ID     int64           `json:"id"`
			Tools  json.RawMessage `json:"tools"`
			Result json.RawMessage `json:"result"`
		}
		if json.Unmarshal(data, &m) != nil {
			continue
		}
		switch m.Type {
		case "tools":
			var n []json.RawMessage
			if json.Unmarshal(m.Tools, &n) != nil {
				continue
			}
			b.mu.Lock()
			b.tools = m.Tools
			b.mu.Unlock()
			log.Printf("app connected (%d tools)", len(n))
		case "result":
			b.mu.Lock()
			ch := b.pending[m.ID]
			delete(b.pending, m.ID)
			b.mu.Unlock()
			if ch != nil {
				ch <- m.Result
			}
		}
	}
}

// call forwards one tool call to the tab and waits for its MCP-style result.
func (b *bridge) call(ctx context.Context, name string, args json.RawMessage) json.RawMessage {
	b.mu.Lock()
	c := b.page
	if c == nil {
		b.mu.Unlock()
		return errResult(notConnected)
	}
	b.nextID++
	id := b.nextID
	ch := make(chan json.RawMessage, 1)
	b.pending[id] = ch
	b.mu.Unlock()
	defer func() {
		b.mu.Lock()
		delete(b.pending, id)
		b.mu.Unlock()
	}()

	msg, _ := json.Marshal(map[string]any{"type": "call", "id": id, "name": name, "input": args})
	if err := c.Write(ctx, websocket.MessageText, msg); err != nil {
		return errResult(notConnected)
	}
	start := time.Now()
	select {
	case res := <-ch:
		log.Printf("%s (%s)", name, time.Since(start).Round(time.Millisecond))
		return res
	case <-time.After(callTimeout):
		return errResult(fmt.Sprintf("Timed out after %s waiting for %s.", callTimeout, name))
	case <-ctx.Done():
		return errResult("Cancelled.")
	}
}

// ---- agent side (MCP, streamable HTTP, JSON responses only) ----

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

func (b *bridge) handleMCP(w http.ResponseWriter, r *http.Request) {
	// Agents send no Origin header; browsers always do. Rejecting it (and
	// unknown Hosts) stops web pages and DNS rebinding from driving the tab.
	host, _, err := net.SplitHostPort(r.Host)
	if err != nil {
		host = r.Host
	}
	if r.Header.Get("Origin") != "" || (host != "127.0.0.1" && host != "localhost" && host != "[::1]") {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxRequestBytes))
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var req struct {
		ID     json.RawMessage `json:"id"`
		Method string          `json:"method"`
		Params struct {
			ProtocolVersion string          `json:"protocolVersion"`
			Name            string          `json:"name"`
			Arguments       json.RawMessage `json:"arguments"`
		} `json:"params"`
	}
	if json.Unmarshal(body, &req) != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if len(req.ID) == 0 { // notification
		w.WriteHeader(http.StatusAccepted)
		return
	}

	resp := rpcResponse{JSONRPC: "2.0", ID: req.ID}
	switch req.Method {
	case "initialize":
		v := req.Params.ProtocolVersion
		if v == "" {
			v = "2025-03-26"
		}
		resp.Result, _ = json.Marshal(map[string]any{
			"protocolVersion": v,
			"capabilities":    map[string]any{"tools": map[string]any{"listChanged": false}},
			"serverInfo":      map[string]string{"name": "lil-mappo", "version": version},
		})
	case "ping":
		resp.Result = json.RawMessage(`{}`)
	case "tools/list":
		b.mu.Lock()
		tools := b.tools
		b.mu.Unlock()
		if tools == nil {
			tools = json.RawMessage(`[]`)
		}
		resp.Result, _ = json.Marshal(map[string]any{"tools": tools})
	case "tools/call":
		resp.Result = b.call(r.Context(), req.Params.Name, req.Params.Arguments)
	default:
		resp.Error = &rpcError{Code: -32601, Message: "method not found"}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ---- main ----

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	fmt.Fprintln(os.Stderr, "Press Enter to close.") // keeps a double-clicked console window readable
	bufio.NewReader(os.Stdin).ReadString('\n')
	os.Exit(1)
}

func main() {
	port := flag.String("port", "47800", "port to listen on (127.0.0.1 only)")
	extra := flag.String("origin", "", "extra page hosts allowed to connect, comma separated (e.g. my-preview.vercel.app)")
	showVersion := flag.Bool("version", false, "print the version and exit")
	flag.Parse()
	if *showVersion {
		fmt.Println(version)
		return
	}

	b := &bridge{pending: map[int64]chan json.RawMessage{}, origins: defaultOrigins}
	for _, o := range strings.Split(*extra, ",") {
		if o = strings.TrimSpace(o); o != "" {
			b.origins = append(b.origins, o)
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/page", b.handlePage)
	mux.HandleFunc("/mcp", b.handleMCP)

	ln, err := net.Listen("tcp", "127.0.0.1:"+*port)
	if err != nil {
		fatal("Could not listen on 127.0.0.1:%s: %v\nIs the bridge already running? Use -port to pick another port.", *port, err)
	}
	url := "http://127.0.0.1:" + *port + "/mcp"
	fmt.Printf(`lil' Mappo bridge %s

Open the app, sign in, and turn on AI control in the AI panel. The app
connects to this bridge by itself.

Connect your agent (once):
  Claude Code:  claude mcp add --transport http lil-mappo %s
  Codex:        codex mcp add lil-mappo --url %s
  Gemini CLI:   gemini mcp add --transport http lil-mappo %s

Waiting for the app... (Ctrl+C to quit)

`, version, url, url, url)
	log.SetFlags(log.Ltime)
	log.Fatal(http.Serve(ln, mux))
}
