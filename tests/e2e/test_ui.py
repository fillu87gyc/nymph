from playwright.sync_api import Page, expect


def test_toolbar_brand(page: Page, live_server):
    page.goto(live_server)
    expect(page.locator(".brand")).to_contain_text("nymph")


def test_markdown_renders(page: Page, live_server):
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    expect(page.locator("h1").first).to_contain_text("Test Document")


def test_filename_in_toolbar(page: Page, live_server):
    page.goto(live_server)
    expect(page.locator("#watch-name")).to_contain_text("test.md")


def test_sse_watch_dot_connected(page: Page, live_server):
    page.goto(live_server)
    page.wait_for_selector("#watch-dot")
    expect(page.locator("#watch-dot")).to_be_visible()
    expect(page.locator("#watch-dot")).not_to_have_class("error")


def test_comment_button_visible_on_hover(page: Page, live_server):
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    block = page.locator(".md-block").first
    block.hover()
    expect(block.locator(".comment-btn")).to_be_visible()


def test_comment_modal_opens(page: Page, live_server):
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    page.locator(".md-block").first.hover()
    page.locator(".comment-btn").first.click()
    expect(page.locator("#comment-modal")).to_have_class("open")


def test_comment_modal_close_cancel(page: Page, live_server):
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    page.locator(".md-block").first.hover()
    page.locator(".comment-btn").first.click()
    page.click("#btn-cancel")
    expect(page.locator("#comment-modal")).not_to_have_class("open")


def test_comment_modal_close_escape(page: Page, live_server):
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    page.locator(".md-block").first.hover()
    page.locator(".comment-btn").first.click()
    page.keyboard.press("Escape")
    expect(page.locator("#comment-modal")).not_to_have_class("open")


def test_comment_modal_close_backdrop(page: Page, live_server):
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    page.locator(".md-block").first.hover()
    page.locator(".comment-btn").first.click()
    page.click("#modal-backdrop")
    expect(page.locator("#comment-modal")).not_to_have_class("open")


def test_comment_submit_button(page: Page, live_server):
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    page.locator(".md-block").first.hover()
    page.locator(".comment-btn").first.click()
    page.fill("#comment-ta", "Test comment")
    page.click("#btn-submit")
    expect(page.locator("#comment-modal")).not_to_have_class("open")
    expect(page.locator("#comment-count")).to_be_visible()
    expect(page.locator("#comment-count")).to_have_text("1")


def test_comment_submit_keyboard(page: Page, live_server):
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    page.locator(".md-block").first.hover()
    page.locator(".comment-btn").first.click()
    page.fill("#comment-ta", "Keyboard comment")
    page.keyboard.press("Control+Enter")
    expect(page.locator("#comment-modal")).not_to_have_class("open")


def test_comments_panel_toggle(page: Page, live_server):
    page.goto(live_server)
    page.click("#btn-comments")
    expect(page.locator("#comments-panel")).to_have_class("open")
    page.click("#btn-close-panel")
    expect(page.locator("#comments-panel")).not_to_have_class("open")


def test_comment_appears_in_panel(page: Page, live_server):
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    page.locator(".md-block").first.hover()
    page.locator(".comment-btn").first.click()
    page.fill("#comment-ta", "Panel comment")
    page.click("#btn-submit")
    # Panel auto-opens after submit
    expect(page.locator("#comments-panel")).to_have_class("open")
    expect(page.locator(".comment-item")).to_have_count(1)


def test_comment_delete(page: Page, live_server):
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    page.locator(".md-block").first.hover()
    page.locator(".comment-btn").first.click()
    page.fill("#comment-ta", "To be deleted")
    page.click("#btn-submit")
    expect(page.locator(".comment-item")).to_have_count(1)
    page.locator(".c-del").first.click()
    expect(page.locator(".comment-item")).to_have_count(0)


def test_theme_toggle(page: Page, live_server):
    page.goto(live_server)
    initial = page.evaluate("document.documentElement.dataset.theme")
    page.click("#btn-theme")
    toggled = page.evaluate("document.documentElement.dataset.theme")
    assert initial != toggled


def test_copy_review_no_comments_toast(page: Page, live_server):
    page.goto(live_server)
    page.click("#btn-copy")
    expect(page.locator("#toast")).to_be_visible()
    expect(page.locator("#toast")).to_contain_text("コメントがありません")
