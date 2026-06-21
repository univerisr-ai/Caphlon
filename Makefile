# =============================================================================
# Project Underdog - Makefile
# =============================================================================

PYTHON := .venv/bin/python
PIP := .venv/bin/pip
RUFF := .venv/bin/ruff
PYTEST := .venv/bin/pytest

.PHONY: help install setup test lint demo clean docker-build docker-up docker-down db-init

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	$(PIP) install --upgrade pip
	$(PIP) install -r project_underdog/requirements.txt
	$(PIP) install ruff pytest pytest-asyncio pytest-cov

wizard: ## Run interactive setup wizard
	$(PYTHON) setup.py

setup: ## Create venv and install everything
	python3 -m venv .venv
	$(PIP) install --upgrade pip
	$(PIP) install -r project_underdog/requirements.txt
	$(PIP) install ruff pytest pytest-asyncio pytest-cov
	cp -n .env.example .env 2>/dev/null || true
	@echo "Setup complete. Edit .env with your configuration."

test: ## Run all tests
	$(PYTEST) tests/ -v --tb=short --cov=project_underdog --cov-report=term-missing

test-coverage: ## Run tests with HTML coverage report
	$(PYTEST) tests/ -v --tb=short --cov=project_underdog --cov-report=html
	@echo "Coverage report: htmlcov/index.html"

lint: ## Lint the code
	$(RUFF) check project_underdog/ tests/

format: ## Auto-format code
	$(RUFF) format project_underdog/ tests/
	$(RUFF) check --fix project_underdog/ tests/

typecheck: ## Run type checker
	$(PYTHON) -m mypy project_underdog/ --ignore-missing-imports

orchestrator: ## Start the orchestrator server
	$(PYTHON) -m project_underdog.main orchestrator

worker: ## Start a worker node
	$(PYTHON) -m project_underdog.main worker --name $(or vbs-worker)

demo: ## Run demo mode (orchestrator + 3 workers)
	$(PYTHON) -m project_underdog.main demo

export: ## Export training data
	$(PYTHON) -m project_underdog.main export --limit 5000

db-init: ## Initialize database tables
	$(PYTHON) -c "import asyncio; from project_underdog.database.engine import get_db_manager; asyncio.run(get_db_manager().create_all()); print('DB initialized')"

clean: ## Clean up generated files
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type f -name "*.pyo" -delete 2>/dev/null || true
	rm -rf .pytest_cache .mypy_cache .ruff_cache htmlcov .coverage coverage.xml
	rm -rf dist build *.egg-info
	rm -f demo_output.log

docker-build: ## Build Docker image
	docker build -t project-underdog .

docker-up: ## Start with Docker Compose
	docker compose up -d

docker-down: ## Stop Docker Compose services
	docker compose down

docker-logs: ## View Docker Compose logs
	docker compose logs -f

docker-up-worker: ## Start orchestartor + worker with Docker
	docker compose --profile worker up -d

all-check: lint test ## Run lint and tests
