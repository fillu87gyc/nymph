"""
Visual Regression Tests.

First run: VRT_UPDATE=1 pytest tests/e2e/test_visual.py  (generates baselines)
Compare:   pytest tests/e2e/test_visual.py               (compares against baselines)
"""

import io
import os
import platform
from pathlib import Path

import pytest
from PIL import Image, ImageChops
from playwright.sync_api import Page

# Platform-specific baselines so macOS and Linux don't clobber each other.
SNAPSHOTS = Path(__file__).parent / "snapshots" / platform.system().lower()
THRESHOLD = 0.003  # allow 0.3% of pixels to differ (antialiasing etc.)


def _compare(current_bytes: bytes, name: str) -> None:
    """Compare screenshot bytes against stored baseline. Fails with diff info on mismatch."""
    SNAPSHOTS.mkdir(exist_ok=True)
    baseline_path = SNAPSHOTS / name

    if os.environ.get("VRT_UPDATE") or not baseline_path.exists():
        baseline_path.write_bytes(current_bytes)
        return

    baseline = Image.open(baseline_path).convert("RGB")
    actual = Image.open(io.BytesIO(current_bytes)).convert("RGB")

    if baseline.size != actual.size:
        _save_actual(name, current_bytes)
        pytest.fail(
            f"[VRT] {name}: size changed {baseline.size} → {actual.size}. "
            "Run VRT_UPDATE=1 to update baselines."
        )

    diff = ImageChops.difference(baseline, actual)
    total = baseline.width * baseline.height
    diff_bytes = diff.tobytes()
    pixel_diffs = sum(1 for i in range(0, len(diff_bytes), 3) if any(diff_bytes[i : i + 3]))
    mismatch = pixel_diffs / total

    if mismatch > THRESHOLD:
        _save_actual(name, current_bytes)
        pytest.fail(
            f"[VRT] {name}: {mismatch:.2%} pixels differ (threshold {THRESHOLD:.2%}). "
            f"Actual saved as {Path(name).stem}-actual.png. "
            "Run VRT_UPDATE=1 to update baselines."
        )


def _assert_screenshot(page: Page, name: str) -> None:
    _compare(page.screenshot(full_page=True), name)


def _save_actual(name: str, data: bytes) -> None:
    stem = Path(name).stem
    (SNAPSHOTS / f"{stem}-actual.png").write_bytes(data)


def _stabilize(page: Page) -> None:
    """Disable animations, trigger full-page rendering, then normalize dynamic content."""
    page.add_style_tag(
        content="""
        *, *::before, *::after {
            animation-duration: 0s !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
        }
    """
    )
    page.wait_for_load_state("load")
    # Mermaid renders asynchronously after .md-block is painted; wait for SVGs.
    try:
        page.wait_for_selector(".mermaid svg", timeout=10_000)
    except Exception:
        pass
    # Scroll the inner container (#main) to bottom so below-the-fold content is rendered,
    # then return to top.  window.scrollTo is a no-op here because body is overflow:hidden.
    page.evaluate("const m=document.getElementById('main'); m.scrollTo(0,m.scrollHeight)")
    page.wait_for_timeout(300)
    page.evaluate("document.getElementById('main').scrollTo(0, 0)")
    # Expand the scroll-constrained app shell so full_page=True captures the full document.
    page.add_style_tag(
        content="""
        html, body { height: auto !important; overflow: visible !important; }
        #app { height: auto !important; }
        #main { flex: none !important; overflow-y: visible !important; }
    """
    )
    page.wait_for_timeout(100)
    page.evaluate("document.getElementById('update-time').textContent = '更新: --:--:--'")


def test_vrt_dark_theme(page: Page, live_server):
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    _stabilize(page)
    _assert_screenshot(page, "dark-theme.png")


def test_vrt_light_theme(page: Page, live_server):
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    _stabilize(page)
    page.click("#btn-theme")
    page.evaluate("document.getElementById('update-time').textContent = '更新: --:--:--'")
    _assert_screenshot(page, "light-theme.png")


def test_vrt_comment_modal(page: Page, live_server):
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    _stabilize(page)
    page.locator(".md-block").first.hover()
    page.locator(".comment-btn").first.click()
    page.fill("#comment-ta", "VRT snapshot comment")
    _assert_screenshot(page, "comment-modal.png")


def test_vrt_comments_panel(page: Page, live_server):
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    page.locator(".md-block").first.hover()
    page.locator(".comment-btn").first.click()
    page.fill("#comment-ta", "VRT panel comment")
    page.click("#btn-submit")
    _stabilize(page)
    _assert_screenshot(page, "comments-panel.png")
