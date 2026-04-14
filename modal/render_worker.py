"""
li'l Mappo — Cloud Render Worker
=================================
Runs headless Chromium on a Modal T4 GPU instance.

Architecture (two-function pattern):
  dispatch_render  — lightweight web endpoint, fire-and-forget spawns background job
  run_render_background — does the actual rendering, may run for up to 1 hour

Deploy:
  modal deploy modal/render_worker.py

After deploying, copy the printed web endpoint URL into the Vercel env var
MODAL_WEBHOOK_URL.

Required Vercel env vars:
  MODAL_WEBHOOK_URL      — from Modal deploy output
  MODAL_DISPATCH_SECRET  — shared secret; must match the Modal secret of the same name
  APP_URL                — e.g. https://app.lilmappo.tech
  DO_SPACES_*            — DigitalOcean Spaces credentials (used by the app, not Modal)

Required Modal secret (modal secret create lil-mappo-dispatch-secret):
  MODAL_DISPATCH_SECRET  — same value as the Vercel env var
  APP_URL                — e.g. https://app.lilmappo.tech
"""

import hmac
import os

import modal

app = modal.App("lil-mappo-renderer")

render_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("playwright==1.44.0")
    .run_commands("playwright install chromium --with-deps")
)


@app.function(
    image=render_image,
    gpu="T4",
    timeout=3600,
    memory=8192,
    cpu=4.0,
)
def run_render_background(job_id: str, render_secret: str, app_url: str):
    """
    Boots headless Chromium, loads the app in render mode, waits for
    window.__renderResult to be set by HeadlessRenderer, then exits.

    The app itself handles:
    - Fetching project data from /api/render-job-data
    - Running the WebCodecs export pipeline
    - Uploading to DigitalOcean Spaces via presigned URL
    - Calling /api/render-complete or /api/render-fail
    """
    from playwright.sync_api import sync_playwright

    url = f"{app_url}?render_job={job_id}&render_secret={render_secret}"
    print(f"[render_worker] Navigating to: {url}")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--enable-gpu",
                "--use-gl=egl",
            ],
        )
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            ignore_https_errors=True,
        )
        page = context.new_page()
        page.on("console", lambda msg: print(f"[browser:{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: print(f"[browser:error] {err}"))

        page.goto(url, wait_until="networkidle", timeout=60_000)

        # Poll for window.__renderResult — set by HeadlessRenderer when done or failed
        print("[render_worker] Waiting for render completion (up to 50 min)...")
        try:
            page.wait_for_function(
                "() => window.__renderResult !== undefined",
                timeout=3_000_000,  # 50 minutes
            )
            result = page.evaluate("() => window.__renderResult")
            print(f"[render_worker] Render complete: {result}")
        except Exception as e:
            print(f"[render_worker] Render timed out or crashed: {e}")
            # HeadlessRenderer should have already called /api/render-fail;
            # nothing more to do here.
        finally:
            browser.close()


@app.function(
    image=modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]"),
    timeout=30,
    secrets=[modal.Secret.from_name("lil-mappo-dispatch-secret")],
)
@modal.fastapi_endpoint(method="POST")
def dispatch_render(data: dict, request: object):
    """
    Lightweight web endpoint — validates the shared dispatch secret, then
    immediately spawns run_render_background as a fire-and-forget task and
    returns, so Vercel's POST to this endpoint completes in well under its
    10s response timeout.

    `request` is injected by FastAPI as a starlette.requests.Request; typed
    as object here to avoid importing FastAPI at module level.
    """
    from fastapi import HTTPException, Request as FastAPIRequest

    req: FastAPIRequest = request  # type: ignore[assignment]

    # Reject requests that don't carry the shared dispatch secret.
    # hmac.compare_digest prevents timing-based secret enumeration.
    expected_secret = os.environ.get("MODAL_DISPATCH_SECRET", "")
    if not expected_secret:
        raise HTTPException(status_code=500, detail="Server misconfiguration: missing dispatch secret")

    provided = req.headers.get("authorization", "")
    if not hmac.compare_digest(provided, f"Bearer {expected_secret}"):
        raise HTTPException(status_code=401, detail="Unauthorized")

    job_id = data["jobId"]
    render_secret = data["renderSecret"]

    # APP_URL comes from the Modal secret, not from the caller, eliminating
    # the SSRF surface that existed when it was accepted as a request param.
    app_url = os.environ.get("APP_URL", "https://app.lilmappo.tech")

    print(f"[dispatch_render] Spawning render for job {job_id}")
    run_render_background.spawn(job_id, render_secret, app_url)

    return {"status": "spawned", "jobId": job_id}
