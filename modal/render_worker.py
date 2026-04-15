"""
li'l Mappo — Cloud Render Worker
=================================
Runs headless Chromium on a Modal T4 GPU instance.

Architecture (two-function pattern):
  dispatch_render        — lightweight web endpoint, validates the dispatch
                           secret and fire-and-forgets run_render_background
  run_render_background  — boots Chromium, runs the WebCodecs export pipeline,
                           intercepts the MP4 download, uploads to DO Spaces
                           via boto3, then calls /api/render-complete

Deploy:
  modal deploy modal/render_worker.py

After deploying, copy the printed web endpoint URL into the Vercel env var
MODAL_WEBHOOK_URL.

Required Vercel env vars:
  MODAL_WEBHOOK_URL      — from Modal deploy output
  MODAL_DISPATCH_SECRET  — shared secret; must match the Modal secret below
  APP_URL                — e.g. https://app.lilmappo.tech

Required Modal secrets:

  modal secret create lil-mappo-dispatch-secret \\
    MODAL_DISPATCH_SECRET=<value> \\
    APP_URL=<value>

  modal secret create lil-mappo-spaces-secret \\
    DO_SPACES_KEY=<value> \\
    DO_SPACES_SECRET=<value> \\
    DO_SPACES_BUCKET=<value> \\
    DO_SPACES_ENDPOINT=<value>   \\ (e.g. ams3.digitaloceanspaces.com)
    DO_SPACES_REGION=<value>       (e.g. ams3)
"""

import hmac
import os

import modal

# starlette.requests.Request is only available in the dispatch_render container
# (fastapi[standard] image), not in the playwright container. The try/except
# lets Modal import this module in both containers without crashing.
# FastAPI requires the exact Request type to inject the request object; using
# plain `object` caused FastAPI to treat `request` as a required body field,
# returning 422 for every call.
try:
    from starlette.requests import Request as _Request
except ImportError:
    _Request = object  # type: ignore[assignment, misc]

app = modal.App("lil-mappo-renderer")

# CUDA base image gives Chromium access to the T4's NVIDIA Vulkan driver
# (bind-mounted from the host by Modal). libvulkan1 provides the Vulkan loader;
# the NVIDIA ICD is supplied by the host driver. Chromium uses ANGLE's Vulkan
# backend for hardware-accelerated WebGL instead of falling back to SwiftShader.
render_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.3.0-base-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install(["libvulkan1", "mesa-vulkan-drivers"])
    .pip_install("playwright==1.44.0", "boto3==1.34.0", "requests==2.31.0")
    .run_commands("playwright install chromium --with-deps")
)


@app.function(
    image=render_image,
    gpu="T4",
    timeout=3600,
    memory=8192,
    cpu=4.0,
    secrets=[modal.Secret.from_name("lil-mappo-spaces-secret")],
)
def run_render_background(job_id: str, render_secret: str, app_url: str):
    """
    1. Boots headless Chromium with NVIDIA Vulkan-backed WebGL.
    2. Loads the app in render mode; HeadlessRenderer runs the export pipeline.
    3. On success HeadlessRenderer triggers a browser download of the MP4.
       Playwright intercepts it and saves to a temp file.
    4. This function uploads the file to DO Spaces via boto3 and calls
       /api/render-complete.
    5. On render failure HeadlessRenderer already called /api/render-fail via
       signalFailure(), so nothing more is needed here.
    """
    import time

    import boto3
    import requests as http
    from playwright.sync_api import sync_playwright

    url = f"{app_url}?render_job={job_id}&render_secret={render_secret}"
    print(f"[render_worker] Navigating to: {url}")

    download_path = f"/tmp/{job_id}.mp4"
    result = None

    with sync_playwright() as p:
        browser = p.chromium.launch(
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--enable-gpu",
                "--use-gl=angle",
                "--use-angle=vulkan",
                "--ignore-gpu-blocklist",
                "--disable-gpu-sandbox",
            ],
        )
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            ignore_https_errors=True,
            accept_downloads=True,
        )
        page = context.new_page()
        page.on("console", lambda msg: print(f"[browser:{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: print(f"[browser:error] {err}"))

        # Register before navigation so we never miss the download event.
        def handle_download(download):
            print(f"[render_worker] Download started: {download.suggested_filename}")
            download.save_as(download_path)
            print(f"[render_worker] Download saved: {download_path}")

        page.on("download", handle_download)

        page.goto(url, wait_until="networkidle", timeout=60_000)

        print("[render_worker] Waiting for render completion (up to 50 min)...")
        try:
            page.wait_for_function(
                "() => window.__renderResult !== undefined",
                timeout=3_000_000,  # 50 minutes
            )
            result = page.evaluate("() => window.__renderResult")
            print(f"[render_worker] Render result: {result}")
        except Exception as e:
            print(f"[render_worker] Render timed out or crashed: {e}")
            # HeadlessRenderer called /api/render-fail via signalFailure().
        finally:
            browser.close()

    if not result or not result.get("success"):
        print(f"[render_worker] Render did not succeed: {result}")
        return

    # The download event fires before __renderResult is set, but give
    # Playwright's handler a moment to finish save_as() if needed.
    for _ in range(10):
        if os.path.exists(download_path):
            break
        time.sleep(0.5)
    else:
        raise RuntimeError(f"Download file not found at {download_path} after render")

    # Upload to DigitalOcean Spaces
    try:
        bucket = os.environ["DO_SPACES_BUCKET"]
        endpoint = os.environ["DO_SPACES_ENDPOINT"]
        output_key = f"renders/{job_id}.mp4"

        s3 = boto3.client(
            "s3",
            region_name=os.environ["DO_SPACES_REGION"],
            endpoint_url=f"https://{endpoint}",
            aws_access_key_id=os.environ["DO_SPACES_KEY"],
            aws_secret_access_key=os.environ["DO_SPACES_SECRET"],
        )

        print(f"[render_worker] Uploading to {bucket}/{output_key} ...")
        s3.upload_file(
            download_path, bucket, output_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )
        output_url = f"https://{bucket}.{endpoint}/{output_key}"
        print(f"[render_worker] Upload complete: {output_url}")

        resp = http.post(
            f"{app_url}/api/render-complete",
            json={"jobId": job_id, "secret": render_secret, "outputUrl": output_url},
            timeout=30,
        )
        print(f"[render_worker] render-complete: {resp.status_code}")

    except Exception as e:
        print(f"[render_worker] Upload/complete failed: {e}")
        http.post(
            f"{app_url}/api/render-fail",
            json={"jobId": job_id, "secret": render_secret, "errorMessage": str(e)},
            timeout=30,
        )


@app.function(
    image=modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]"),
    timeout=30,
    secrets=[modal.Secret.from_name("lil-mappo-dispatch-secret")],
)
@modal.fastapi_endpoint(method="POST")
def dispatch_render(data: dict, request: _Request):
    """
    Lightweight web endpoint — validates the shared dispatch secret, then
    immediately spawns run_render_background as a fire-and-forget task and
    returns, so Vercel's POST to this endpoint completes in well under its
    10s response timeout.
    """
    from fastapi import HTTPException

    req = request

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
