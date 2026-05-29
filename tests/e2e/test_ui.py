from playwright.sync_api import expect, Page


# ── Helpers ───────────────────────────────────────────────────────────────────

def _select_word(page, word: str) -> None:
    """#content 内の word をJS で選択し、selection popup が出るまで待つ。"""
    page.evaluate(
        """(word) => {
            const all = document.querySelectorAll('#content .md-block *');
            let textNode = null, idx = -1;
            for (const el of all) {
                for (const child of el.childNodes) {
                    if (child.nodeType === 3) {
                        const i = child.textContent.indexOf(word);
                        if (i >= 0) { textNode = child; idx = i; break; }
                    }
                }
                if (textNode) break;
            }
            if (!textNode) throw new Error('word not found: ' + word);
            const range = document.createRange();
            range.setStart(textNode, idx);
            range.setEnd(textNode, idx + word.length);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            document.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
        }""",
        word,
    )
    page.wait_for_selector("#selection-popup.visible")


def _add_selection_comment(page, word: str, comment_text: str) -> None:
    """word を選択 → ポップアップをクリック → コメント入力 → 追加。"""
    _select_word(page, word)
    page.click("#btn-selection-comment")
    page.fill("#comment-ta", comment_text)
    page.click("#btn-submit")


def _add_block_comment(page, comment_text: str) -> None:
    """最初のブロックの + ボタンでコメントを追加。"""
    page.wait_for_selector(".md-block")
    page.locator(".md-block").first.hover()
    page.locator(".comment-btn").first.click()
    page.fill("#comment-ta", comment_text)
    page.click("#btn-submit")


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


# ── Selection popup ───────────────────────────────────────────────────────────

def test_selection_popup_appears(page: Page, live_server):
    """テキストをドラッグ選択するとポップアップが表示される。"""
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    _select_word(page, "paragraph")
    expect(page.locator("#selection-popup")).to_have_class("visible")


def test_selection_comment_modal_ctx_is_selected_text(page: Page, live_server):
    """ポップアップをクリックするとモーダルの context が選択テキストになる。"""
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    _select_word(page, "bold")
    page.click("#btn-selection-comment")
    expect(page.locator("#comment-modal")).to_have_class("open")
    expect(page.locator("#modal-ctx")).to_contain_text("bold")
    # 短い選択テキスト(≤20字)はタイトルに「word」形式で表示される
    expect(page.locator("#modal-line")).to_contain_text("bold")


def test_selection_comment_added_to_panel(page: Page, live_server):
    """文字指定コメントがパネルに追加され、ctx に選択テキストが入る。"""
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    _add_selection_comment(page, "paragraph", "ここ気になる")
    expect(page.locator("#comments-panel")).to_have_class("open")
    expect(page.locator(".comment-item")).to_have_count(1)
    expect(page.locator(".c-ctx").first).to_contain_text("paragraph")
    expect(page.locator(".c-text").first).to_contain_text("ここ気になる")


# ── Block comment regression ──────────────────────────────────────────────────

def test_block_comment_still_works(page: Page, live_server):
    """選択機能追加後も + ボタンによるブロック指定コメントが機能する。"""
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    _add_block_comment(page, "ブロックコメント")
    expect(page.locator("#comments-panel")).to_have_class("open")
    expect(page.locator(".comment-item")).to_have_count(1)
    expect(page.locator("#comment-count")).to_have_text("1")


# ── Multiple selection comments ───────────────────────────────────────────────

def test_multiple_selection_comments_all_listed(page: Page, live_server):
    """複数の文字指定コメントがすべてパネルに一覧表示される。"""
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    _add_selection_comment(page, "bold", "コメント1")
    _add_selection_comment(page, "Another", "コメント2")
    _add_selection_comment(page, "hello", "コメント3")

    expect(page.locator(".comment-item")).to_have_count(3)
    expect(page.locator("#comment-count")).to_have_text("3")
    panel_text = page.locator("#comments-list").inner_text()
    for word in ("bold", "Another", "hello"):
        assert word in panel_text, f"'{word}' がパネルに表示されていない"


def test_multiple_selection_comments_each_clickable(page: Page, live_server):
    """パネルの各コメント行をクリックでき、クリック後もコメント件数が変わらない。"""
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    _add_selection_comment(page, "bold", "コメント1")
    _add_selection_comment(page, "Another", "コメント2")

    items = page.locator(".comment-item")
    expect(items).to_have_count(2)
    # 各アイテムの本文部分をクリック(削除ボタンは避ける)
    items.nth(0).locator(".c-body").click()
    items.nth(1).locator(".c-body").click()
    # クリック後もコメント件数が維持される(誤削除がない)
    expect(items).to_have_count(2)


# ── Panel click → block highlight ────────────────────────────────────────────

def test_block_comment_panel_click_highlights(page: Page, live_server):
    """ブロック指定コメントをパネルでクリックすると対応ブロックがハイライトされる。"""
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    _add_block_comment(page, "ハイライトテスト")

    page.locator(".comment-item").first.locator(".c-body").click()
    has_outline = page.evaluate(
        "() => [...document.querySelectorAll('.md-block')].some(b => b.style.outline !== '')"
    )
    assert has_outline, "パネルクリック後にブロックの outline が設定されていない"


def test_selection_comment_panel_click_highlights(page: Page, live_server):
    """文字指定コメントをパネルでクリックすると対応ブロックがハイライトされる。"""
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    _add_selection_comment(page, "paragraph", "文字選択ハイライト")

    page.locator(".comment-item").first.locator(".c-body").click()
    has_outline = page.evaluate(
        "() => [...document.querySelectorAll('.md-block')].some(b => b.style.outline !== '')"
    )
    assert has_outline, "パネルクリック後にブロックの outline が設定されていない"


# ── Coexistence ───────────────────────────────────────────────────────────────

def test_block_and_selection_comments_coexist(page: Page, live_server):
    """ブロック指定コメントと文字指定コメントが混在して正しく動作する。"""
    page.goto(live_server)
    page.wait_for_selector(".md-block")

    _add_block_comment(page, "ブロック指定コメント")
    _add_selection_comment(page, "paragraph", "文字指定コメント1")
    _add_selection_comment(page, "Another", "文字指定コメント2")

    expect(page.locator(".comment-item")).to_have_count(3)
    expect(page.locator("#comment-count")).to_have_text("3")

    # 3件のコメントテキストがすべてパネルに存在する
    all_texts = page.locator(".c-text").all_inner_texts()
    assert "ブロック指定コメント" in all_texts
    assert "文字指定コメント1" in all_texts
    assert "文字指定コメント2" in all_texts

    # どのコメントをクリックしてもハイライトが発生する
    for i in range(3):
        page.locator(".comment-item").nth(i).locator(".c-body").click()
        has_outline = page.evaluate(
            "() => [...document.querySelectorAll('.md-block')].some(b => b.style.outline !== '')"
        )
        assert has_outline, f"コメント {i + 1} クリック後にハイライトがない"
        # アニメーション終了前にアウトラインをリセットして次のクリックに備える
        page.evaluate(
            "() => document.querySelectorAll('.md-block')"
            ".forEach(b => { b.style.outline = ''; b.style.outlineOffset = ''; })"
        )
