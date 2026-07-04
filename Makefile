# =============================================================================
# Caphlon — Makefile
# =============================================================================

.PHONY: help setup-cores test-core test-hive all-check docker-build docker-up docker-down docker-logs clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

setup-cores: ## Install + build the JS cores (Caphlon CLI + Qualixar OS) so `caphlon run` works
	bash scripts/setup-cores.sh

test-core: ## Run core/*.py stdlib tests (security, mimo-features) — Python ≥3.10
	python3 core/test_security.py
	python3 core/test_mimo_features.py

test-hive: ## Run Kovan Zekası (hive) tests — pure stdlib, no deps
	bash scripts/test-hive.sh

all-check: test-core test-hive ## Run all Python test suites

docker-build: ## Build the Kovan (hive) coordinator image
	docker build -f Dockerfile.hive -t caphlon-hive .

docker-up: ## Start the Kovan coordinator with Docker Compose
	docker compose up -d

docker-down: ## Stop Docker Compose services
	docker compose down

docker-logs: ## View Docker Compose logs
	docker compose logs -f

clean: ## Clean up generated files
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type f -name "*.pyo" -delete 2>/dev/null || true
	rm -rf .pytest_cache .mypy_cache .ruff_cache htmlcov .coverage coverage.xml
