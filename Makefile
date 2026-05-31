.PHONY: run

FILES := $(filter-out run,$(MAKECMDGOALS))

run:
	@if [ -z "$$TMUX" ]; then \
		echo "エラー: tmux セッション内で実行してください"; \
		exit 1; \
	fi
	@if [ -z "$(FILES)" ]; then \
		echo "エラー: .md ファイルを指定してください (例: make run ROADMAP.md)"; \
		exit 1; \
	fi
	tmux split-window -h "bunx vite"
	bun run src/cli.ts $(FILES)

%:
	@:
