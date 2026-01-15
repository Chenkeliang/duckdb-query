.PHONY: lint lint-fix test import-check layer-check relative-check verify

# 确保 PYTHONPATH 包含当前目录 (api/)
export PYTHONPATH := $(shell pwd)

lint:
	ruff check .

lint-fix:
	ruff check --fix .

test:
	pytest tests/ -v

import-check:
	python -m scripts.test_all_imports

layer-check:
	python -m scripts.check_layer_constraints

relative-check:
	python -m scripts.check_relative_imports

# 完整验证流程
verify: lint relative-check layer-check import-check test
	@echo "✅ All checks passed"
