from playwright.sync_api import Page, expect

# ── Helpers ───────────────────────────────────────────────────────────────────


def _select_word(page, word: str) -> None:
    """#content 内の word をJS で選択し、selection popup が出るまで待つ。"""
    _select_word_nth(page, word, 0)


def _select_word_nth(page, word: str, n: int) -> None:
    """#content 内の word の n 番目(0-indexed)の出現を選択する。"""
    page.evaluate(
        """([word, n]) => {
            const all = document.querySelectorAll('#content .md-block *');
            let found = 0;
            for (const el of all) {
                for (const child of el.childNodes) {
                    if (child.nodeType !== 3) continue;
                    let start = 0;
                    while (true) {
                        const i = child.textContent.indexOf(word, start);
                        if (i < 0) break;
                        if (found === n) {
                            const range = document.createRange();
                            range.setStart(child, i);
                            range.setEnd(child, i + word.length);
                            window.getSelection().removeAllRanges();
                            window.getSelection().addRange(range);
                            document.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
                            return;
                        }
                        found++;
                        start = i + 1;
                    }
                }
            }
            throw new Error(`word '${word}' occurrence ${n} not found`);
        }""",
        [word, n],
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
    expect(page.locator("h1").first).to_contain_text("フルスペック")


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
    _select_word(page, "fibonacci")
    expect(page.locator("#selection-popup")).to_have_class("visible")


def test_selection_comment_modal_ctx_is_selected_text(page: Page, live_server):
    """ポップアップをクリックするとモーダルの context が選択テキストになる。"""
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    _select_word(page, "fibonacci")
    page.click("#btn-selection-comment")
    expect(page.locator("#comment-modal")).to_have_class("open")
    expect(page.locator("#modal-ctx")).to_contain_text("fibonacci")
    # 短い選択テキスト(≤20字)はタイトルに「word」形式で表示される
    expect(page.locator("#modal-line")).to_contain_text("fibonacci")


def test_selection_comment_added_to_panel(page: Page, live_server):
    """文字指定コメントがパネルに追加され、ctx に選択テキストが入る。"""
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    _add_selection_comment(page, "seq", "ここ気になる")
    expect(page.locator("#comments-panel")).to_have_class("open")
    expect(page.locator(".comment-item")).to_have_count(1)
    expect(page.locator(".c-ctx").first).to_contain_text("seq")
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
    _add_selection_comment(page, "fibonacci", "コメント1")
    _add_selection_comment(page, "async", "コメント2")
    _add_selection_comment(page, "poetry", "コメント3")

    expect(page.locator(".comment-item")).to_have_count(3)
    expect(page.locator("#comment-count")).to_have_text("3")
    panel_text = page.locator("#comments-list").inner_text()
    for word in ("fibonacci", "async", "poetry"):
        assert word in panel_text, f"'{word}' がパネルに表示されていない"


def test_multiple_selection_comments_each_clickable(page: Page, live_server):
    """パネルの各コメント行をクリックでき、クリック後もコメント件数が変わらない。"""
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    _add_selection_comment(page, "fibonacci", "コメント1")
    _add_selection_comment(page, "async", "コメント2")

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
    """文字指定コメントをパネルでクリックすると mark.text-highlight が表示される。"""
    page.goto(live_server)
    page.wait_for_selector(".md-block")
    _add_selection_comment(page, "fibonacci", "文字選択ハイライト")

    page.locator(".comment-item").first.locator(".c-body").click()
    page.wait_for_selector("mark.text-highlight", timeout=2000)
    mark = page.locator("mark.text-highlight")
    expect(mark).to_be_visible()
    assert mark.text_content() == "fibonacci"


def test_selection_highlight_correct_occurrence(page: Page, live_server):
    """同じ文字列が複数ある場合、選択した出現箇所がハイライトされる。

    バグ再現: selection_offset なしでは常に最初の出現がハイライトされていた。
    SAMPLE_MD の Python/TypeScript コードブロック内の "return" (Python×1 + TypeScript×2 = 計3回) で
    3番目 (index=2, TypeScript の2つ目の return) を選択してコメントを追加し、
    パネルクリック時に TypeScript ブロックがハイライトされることを確認する。
    """
    page.goto(live_server)
    page.wait_for_selector(".md-block")

    # 3番目(index=2)の "return" を選択してコメント追加
    _select_word_nth(page, "return", 2)
    page.click("#btn-selection-comment")
    page.fill("#comment-ta", "3番目のreturn")
    page.click("#btn-submit")

    page.locator(".comment-item").first.locator(".c-body").click()
    page.wait_for_selector("mark.text-highlight", timeout=2000)

    mark = page.locator("mark.text-highlight")
    expect(mark).to_be_visible()
    assert mark.text_content() == "return"

    # ハイライトされた mark の親要素が TypeScript コード (fetchUser を含む) であること
    parent_text = mark.evaluate("el => el.parentElement.textContent")
    assert "fetchUser" in parent_text, (
        f"3番目の 'return' (TypeScript) がハイライトされるべきだが、"
        f"実際の親テキスト: {parent_text!r}"
    )


# ── Coexistence ───────────────────────────────────────────────────────────────


def test_block_and_selection_comments_coexist(page: Page, live_server):
    """ブロック指定コメントと文字指定コメントが混在して正しく動作する。"""
    page.goto(live_server)
    page.wait_for_selector(".md-block")

    _add_block_comment(page, "ブロック指定コメント")
    _add_selection_comment(page, "fibonacci", "文字指定コメント1")
    _add_selection_comment(page, "async", "文字指定コメント2")

    expect(page.locator(".comment-item")).to_have_count(3)
    expect(page.locator("#comment-count")).to_have_text("3")

    # 3件のコメントテキストがすべてパネルに存在する
    all_texts = page.locator(".c-text").all_inner_texts()
    assert "ブロック指定コメント" in all_texts
    assert "文字指定コメント1" in all_texts
    assert "文字指定コメント2" in all_texts

    # どのコメントをクリックしてもハイライトが発生する
    # ブロック指定 → outline、文字指定 → mark.text-highlight のどちらか
    for i in range(3):
        page.locator(".comment-item").nth(i).locator(".c-body").click()
        has_highlight = page.evaluate(
            """() =>
                [...document.querySelectorAll('.md-block')].some(b => b.style.outline !== '')
                || document.querySelector('mark.text-highlight') !== null
            """
        )
        assert has_highlight, f"コメント {i + 1} クリック後にハイライトがない"
        page.evaluate(
            """() => {
                document.querySelectorAll('.md-block')
                    .forEach(b => { b.style.outline = ''; b.style.outlineOffset = ''; });
                document.querySelectorAll('mark.text-highlight').forEach(m => {
                    const p = m.parentNode;
                    if (!p) return;
                    while (m.firstChild) p.insertBefore(m.firstChild, m);
                    p.removeChild(m);
                });
            }"""
        )


# ── comment-btn 位置バグ回帰 ──────────────────────────────────────────────────


def test_comment_btn_near_top_of_tall_list(page: Page, live_server):
    """多段リストの comment-btn がブロック先頭付近（上端 30% 以内）に表示される。

    バグ: top: 50% により多段リストの中央（draw.io 行など）にボタンが出ていた。
    修正: top: 0.7em（固定値）でブロック先頭付近に固定される。
    SAMPLE_MD の番号付きリスト（5 項目、ol タグ）を対象にする。
    ネストリストは内部に複数の md-block を持つため ol ブロックを直接指定する。
    """
    page.goto(live_server)
    page.wait_for_selector(".md-block")

    # 番号付きリスト（ol を直接含む md-block）を取得 — ネストなしで comment-btn が 1 つ
    ordered_block = page.locator(".md-block[data-block-type='list']").filter(
        has=page.locator("ol")
    ).first
    block_box = ordered_block.bounding_box()
    assert block_box is not None and block_box["height"] > 80, (
        "番号付きリストブロックが見つからないか高さ不足です"
    )

    ordered_block.hover()
    btn_box = ordered_block.locator("> .comment-btn").bounding_box()
    assert btn_box is not None

    btn_center_y = btn_box["y"] + btn_box["height"] / 2
    offset_ratio = (btn_center_y - block_box["y"]) / block_box["height"]

    assert offset_ratio < 0.3, (
        f"comment-btn がブロック上端から {offset_ratio:.0%} の位置にあります"
        f"（期待: 30% 以内）。top: 50% への誤戻りを確認してください。"
    )


def test_single_contiguous_list_is_one_block(page: Page, live_server):
    """空行のない連続リストが 1 つの md-block としてレンダリングされる。

    バグ: リスト間の空行（例: - aaaa\\n\\n- 次の項目）で意図せず
    ブロックが分割され、comment-btn が重複表示されていた。
    SAMPLE_MD の番号付きリスト（5 項目、空行なし）は 1 ブロックであること。
    """
    page.goto(live_server)
    page.wait_for_selector(".md-block")

    ordered_block_count = page.evaluate("""() =>
        [...document.querySelectorAll('.md-block[data-block-type="list"]')]
            .filter(el => el.querySelector('ol') !== null)
            .length
    """)

    assert ordered_block_count == 1, (
        f"番号付きリストが {ordered_block_count} ブロックに分割されました（期待: 1）。"
        "リスト項目間の空行による意図しない分割が発生している可能性があります。"
    )
