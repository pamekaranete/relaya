.PHONY: start
start:
	poetry run uvicorn --app-dir=backend main:app --reload --port 8081 --host 0.0.0.0

.PHONY: format
format:
	poetry run ruff format .
	poetry run ruff --select I --fix .

.PHONY: lint
lint:
	poetry run ruff .
	poetry run ruff format . --diff
	poetry run ruff --select I .

env:
	@if [ -f .env ]; then \
		echo ".env file already exists. Skipping creation."; \
	else \
		echo "Creating .env file from .env.example..."; \
		cp .env.example .env; \
		echo ".env file created successfully."; \
	fi
