import { useEffect, useRef } from 'react';

/** `/watch` が push するメッセージ（src/server.ts の handleWatch と対応）。 */
export interface WatchMessage {
  /** 内容が変わったファイルの絶対パス */
  file?: string;
  /** 辞書（dict.json）が更新された */
  dictUpdated?: boolean;
  /** タブ一覧（開いているファイル・選択中タブ）が変わった */
  filesChanged?: boolean;
}

export function useSSE(onEvent: (msg: WatchMessage) => void) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    const sse = new EventSource('/watch');
    sse.onmessage = (e) => {
      window.dispatchEvent(new Event('sse:heartbeat'));
      try {
        const msg = JSON.parse(e.data) as WatchMessage;
        // 中身の無い `{}` は接続確認の ping。heartbeat だけに使い、
        // 毎秒コールバックを呼ばない。
        if (msg.file || msg.dictUpdated || msg.filesChanged) cbRef.current(msg);
      } catch {
        /* ignore */
      }
    };
    return () => sse.close();
  }, []);
}
