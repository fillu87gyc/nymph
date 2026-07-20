import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Comment } from '../../src/client/types.ts';
import {
  getReviewDir,
  hasCheckpoint,
  readCheckpoint,
  readComments,
  reviewKey,
  writeCheckpoint,
  writeComments,
} from '../../src/reviewStore.ts';

const TMP_DIR = join(tmpdir(), `nymph-reviewstore-test-${process.pid}`);
const FILES_DIR = join(TMP_DIR, 'files');

function makeMd(name: string, content = `# ${name}\n`): string {
  const p = join(FILES_DIR, name);
  writeFileSync(p, content);
  return p;
}

function sampleComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    lineStart: 1,
    lineEnd: 1,
    block_type: 'paragraph',
    context: 'hello',
    text: 'a comment',
    ...overrides,
  };
}

// テスト専用の XDG_DATA_HOME に切り替えて本物の ~/.local/share を汚染しない
beforeEach(() => {
  mkdirSync(FILES_DIR, { recursive: true });
  process.env.XDG_DATA_HOME = TMP_DIR;
});

afterEach(() => {
  delete process.env.XDG_DATA_HOME;
  try {
    rmSync(TMP_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
});

describe('reviewKey', () => {
  it('同じ絶対パスには常に同じキーを返す（決定論的）', () => {
    const a = makeMd('a.md');
    expect(reviewKey(a)).toBe(reviewKey(a));
  });

  it('12桁の16進文字列を返す', () => {
    const a = makeMd('a.md');
    expect(reviewKey(a)).toMatch(/^[0-9a-f]{12}$/);
  });

  it('異なるパスには異なるキーを返す', () => {
    const a = makeMd('a.md');
    const b = makeMd('b.md');
    expect(reviewKey(a)).not.toBe(reviewKey(b));
  });

  it('symlink はたどらない（実パスとリンクパスでキーが異なる）', () => {
    const real = makeMd('real.md');
    const link = join(FILES_DIR, 'link.md');
    symlinkSync(real, link);
    expect(reviewKey(link)).not.toBe(reviewKey(real));
  });
});

describe('comments: 未存在 → 空配列', () => {
  it('新store・レガシーともに無ければ空配列を返す', () => {
    const a = makeMd('a.md');
    expect(readComments(a)).toEqual([]);
  });
});

describe('comments: エンベロープの round-trip', () => {
  it('writeComments で保存した内容を readComments で復元できる', () => {
    const a = makeMd('a.md');
    const comments = [sampleComment(), sampleComment({ id: 2, text: 'two' })];
    writeComments(a, comments);
    expect(readComments(a)).toEqual(comments);
  });

  it('ディスク上は version/file/updatedAt/comments のエンベロープ形式で保存される', () => {
    const a = makeMd('a.md');
    const comments = [sampleComment()];
    const before = new Date();
    writeComments(a, comments);
    const raw = JSON.parse(
      readFileSync(join(getReviewDir(a), 'comments.json'), 'utf-8'),
    );
    expect(raw.version).toBe(2);
    expect(raw.file).toBe(a);
    expect(raw.comments).toEqual(comments);
    expect(new Date(raw.updatedAt).toISOString()).toBe(raw.updatedAt);
    expect(new Date(raw.updatedAt).getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
  });

  it('Comment 配列自体の型は変えず、そのまま格納する', () => {
    const a = makeMd('a.md');
    const comments = [
      sampleComment({
        block_type: 'table',
        context: { headers: ['h'], rows: [{ h: '1' }] },
      }),
    ];
    writeComments(a, comments);
    expect(readComments(a)).toEqual(comments);
  });
});

describe('comments: レガシー移行', () => {
  it('裸配列のレガシーファイルをエンベロープ化し、レガシーは削除する', () => {
    const a = makeMd('a.md');
    const legacyPath = `${a}.comments.json`;
    const legacyComments = [sampleComment({ text: 'legacy' })];
    writeFileSync(legacyPath, JSON.stringify(legacyComments));

    const result = readComments(a);

    expect(result).toEqual(legacyComments);
    expect(existsSync(legacyPath)).toBe(false);
    expect(existsSync(join(getReviewDir(a), 'comments.json'))).toBe(true);
    const raw = JSON.parse(
      readFileSync(join(getReviewDir(a), 'comments.json'), 'utf-8'),
    );
    expect(raw.version).toBe(2);
    expect(raw.comments).toEqual(legacyComments);
  });

  it('移行は冪等（2回目はレガシーが無くても壊れず新storeの内容を返す）', () => {
    const a = makeMd('a.md');
    const legacyPath = `${a}.comments.json`;
    const legacyComments = [sampleComment({ text: 'legacy' })];
    writeFileSync(legacyPath, JSON.stringify(legacyComments));

    const first = readComments(a);
    const second = readComments(a);

    expect(first).toEqual(legacyComments);
    expect(second).toEqual(legacyComments);
    expect(existsSync(legacyPath)).toBe(false);
  });

  it('新store側に既にファイルがあればレガシーには触れず新store側を優先する', () => {
    const a = makeMd('a.md');
    const legacyPath = `${a}.comments.json`;
    writeFileSync(
      legacyPath,
      JSON.stringify([sampleComment({ text: 'legacy stale' })]),
    );

    const newStoreComments = [sampleComment({ text: 'new store wins' })];
    writeComments(a, newStoreComments);

    const result = readComments(a);

    expect(result).toEqual(newStoreComments);
    // 新store優先のためレガシーファイルは触らず残る
    expect(existsSync(legacyPath)).toBe(true);
  });
});

describe('comments: 破損 JSON の扱い', () => {
  it('パース不能な comments.json は corrupt- にリネーム退避し、空配列を返す', () => {
    const a = makeMd('a.md');
    const dir = getReviewDir(a);
    mkdirSync(dir, { recursive: true });
    const commentsPath = join(dir, 'comments.json');
    writeFileSync(commentsPath, '{not valid json');

    const result = readComments(a);

    expect(result).toEqual([]);
    expect(existsSync(commentsPath)).toBe(false);
    const entries = readdirSync(dir);
    const corruptFile = entries.find((e) =>
      /^comments\.json\.corrupt-\d+$/.test(e),
    );
    expect(corruptFile).toBeDefined();
    if (corruptFile) {
      expect(readFileSync(join(dir, corruptFile), 'utf-8')).toBe(
        '{not valid json',
      );
    }
  });

  it('壊れたファイルを上書きせず退避してから、新しい保存は正常に行える', () => {
    const a = makeMd('a.md');
    const dir = getReviewDir(a);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'comments.json'), 'not json at all');

    readComments(a); // 退避が走る

    const fresh = [sampleComment({ text: 'after recovery' })];
    writeComments(a, fresh);
    expect(readComments(a)).toEqual(fresh);
  });
});

describe('comments: アトミック書き込み', () => {
  it('writeComments 後、ディレクトリに一時ファイルが残らない', () => {
    const a = makeMd('a.md');
    writeComments(a, [sampleComment()]);
    const dir = getReviewDir(a);
    const entries = readdirSync(dir);
    expect(entries).toContain('comments.json');
    expect(entries.every((e) => !e.includes('.tmp'))).toBe(true);
  });
});

describe('checkpoint: 未存在 → null', () => {
  it('新store・レガシーともに無ければ null を返す', () => {
    const a = makeMd('a.md');
    expect(readCheckpoint(a)).toBeNull();
    expect(hasCheckpoint(a)).toBe(false);
  });
});

describe('checkpoint: round-trip（現行フォーマットのまま = 全文テキスト）', () => {
  it('writeCheckpoint で保存した全文を readCheckpoint で復元できる', () => {
    const a = makeMd('a.md');
    const text = '# Title\n\nSome content here.\n';
    writeCheckpoint(a, text);
    expect(readCheckpoint(a)).toBe(text);
    expect(hasCheckpoint(a)).toBe(true);
  });

  it('ディスク上はプレーンテキストのまま（JSON エンベロープなし）', () => {
    const a = makeMd('a.md');
    const text = '# Title\n\nSome content here.\n';
    writeCheckpoint(a, text);
    const raw = readFileSync(join(getReviewDir(a), 'checkpoint'), 'utf-8');
    expect(raw).toBe(text);
  });
});

describe('checkpoint: レガシー移行', () => {
  it('レガシーの <file>.checkpoint を新storeへ移動し、レガシーは削除する', () => {
    const a = makeMd('a.md');
    const legacyPath = `${a}.checkpoint`;
    const text = 'legacy checkpoint content\n';
    writeFileSync(legacyPath, text);

    const result = readCheckpoint(a);

    expect(result).toBe(text);
    expect(existsSync(legacyPath)).toBe(false);
    expect(existsSync(join(getReviewDir(a), 'checkpoint'))).toBe(true);
  });

  it('移行は冪等', () => {
    const a = makeMd('a.md');
    const legacyPath = `${a}.checkpoint`;
    const text = 'legacy checkpoint content\n';
    writeFileSync(legacyPath, text);

    const first = readCheckpoint(a);
    const second = readCheckpoint(a);

    expect(first).toBe(text);
    expect(second).toBe(text);
  });

  it('新store側に既にあればレガシーには触れず新store側を優先する', () => {
    const a = makeMd('a.md');
    const legacyPath = `${a}.checkpoint`;
    writeFileSync(legacyPath, 'legacy stale');
    writeCheckpoint(a, 'new store wins');

    expect(readCheckpoint(a)).toBe('new store wins');
    expect(existsSync(legacyPath)).toBe(true);
  });
});

describe('checkpoint: アトミック書き込み', () => {
  it('writeCheckpoint 後、ディレクトリに一時ファイルが残らない', () => {
    const a = makeMd('a.md');
    writeCheckpoint(a, 'content');
    const dir = getReviewDir(a);
    const entries = readdirSync(dir);
    expect(entries).toContain('checkpoint');
    expect(entries.every((e) => !e.includes('.tmp'))).toBe(true);
  });
});

describe('複数ファイルの分離', () => {
  it('異なるファイルは別々の store ディレクトリに保存され混ざらない', () => {
    const a = makeMd('a.md');
    const b = makeMd('b.md');
    writeComments(a, [sampleComment({ text: 'for a' })]);
    writeComments(b, [sampleComment({ text: 'for b' })]);
    writeCheckpoint(a, 'checkpoint a');
    writeCheckpoint(b, 'checkpoint b');

    expect(readComments(a)[0].text).toBe('for a');
    expect(readComments(b)[0].text).toBe('for b');
    expect(readCheckpoint(a)).toBe('checkpoint a');
    expect(readCheckpoint(b)).toBe('checkpoint b');
    expect(getReviewDir(a)).not.toBe(getReviewDir(b));
  });
});
