.PHONY: help build up down restart logs ps shell clean

APP_NAME = god-is-loving-and-kind-bot

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

build: ## Build or rebuild the Docker image
	docker compose build

up: ## Start the bot in the background (daemon)
	docker compose up -d

down: ## Stop and remove the container
	docker compose down

restart: down up ## Restart the bot container

logs: ## Tail container logs
	docker compose logs -f

ps: ## Show container status
	docker compose ps

shell: ## Open a shell inside the running container
	docker compose exec bot sh

clean: ## Remove the container, image, and any orphaned volumes
	docker compose down --rmi local --volumes --remove-orphans

# ---- Quick-start convenience ----

start: ## Build & start (one-shot)
	docker compose up -d --build

reset: clean build up ## Full clean rebuild and start
