# lil-mappo-bridge

Lets local coding agents (Claude Code, Codex, Antigravity CLI / agy, ...) use the lil' Mappo tab open in your browser.

```
agent --MCP over HTTP--> bridge <--WebSocket-- app tab
```

The bridge holds no tool logic. The tab registers its tools over the WebSocket and executes calls; the bridge translates between that and MCP.

## Use

1. Download the binary for your OS from the latest `bridge-v*` GitHub release and run it (from a terminal, or double-click on Windows).
2. Open the app, sign in, and turn on AI control in the AI panel. The tab connects on its own.
3. Add it to your agent once, with the command the bridge prints, e.g. `claude mcp add --transport http lil-mappo http://127.0.0.1:47800/mcp`.

macOS: unsigned binaries need `xattr -d com.apple.quarantine ./lil-mappo-bridge-darwin-arm64` (or right-click, Open).

Flags: `-port 47800` (the app is hardcoded to this port, see `src/agent/bridge.ts` and the CSP in `vercel.json`), `-origin host1,host2` to allow extra page hosts such as a preview deployment.

## Security

- Listens on 127.0.0.1 only.
- The page socket only accepts the app's origins (plus localhost dev servers). `/mcp` rejects any request carrying an `Origin` header and any non-loopback `Host`, so web pages and DNS rebinding cannot drive the tab.
- One tab at a time: a newer tab replaces the old one.

## Develop

`go test ./...` and `go run . -origin ...` inside this folder. The wire protocol is documented at the top of `src/agent/bridge.ts`. Build all platforms via the "Build bridge" workflow (manual run; give it a tag to attach the binaries to a release).
