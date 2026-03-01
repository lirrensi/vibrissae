# Vibrissae Makefile
# Build commands for web (Vue) and server (Go)

# Version for Go builds - override with: make build VERSION=1.2.3
VERSION ?= dev

# Directories
WEB_DIR := web_ui
SERVER_DIR := server

# -----------------------------------------------------------------------------
# Web builds
# -----------------------------------------------------------------------------

.PHONY: web
web: ## Build web for server mode (outputs to server/dist/)
	cd $(WEB_DIR) && pnpm build:server

.PHONY: web-p2p
web-p2p: ## Build web for P2P static hosting
	cd $(WEB_DIR) && pnpm build:p2p

.PHONY: web-single
web-single: ## Build web as single HTML file (for standalone P2P)
	cd $(WEB_DIR) && pnpm build:p2p:single

# -----------------------------------------------------------------------------
# Server builds
# -----------------------------------------------------------------------------

.PHONY: build
build: web ## Build production server with embedded web (single exe)
	cd $(SERVER_DIR) && go build -ldflags "-X main.Version=$(VERSION)" -o vibrissae .

.PHONY: build-dev
build-dev: ## Build dev server (reads from dist/ at runtime, no embedding)
	cd $(SERVER_DIR) && go build -tags dev -ldflags "-X main.Version=$(VERSION)" -o vibrissae .

.PHONY: run
run: build-dev ## Build and run dev server (with live dist/ access)
	cd $(SERVER_DIR) && ./vibrissae

# -----------------------------------------------------------------------------
# Development
# -----------------------------------------------------------------------------

.PHONY: dev
dev: ## Start web dev server (assumes you run server separately)
	cd $(WEB_DIR) && pnpm dev

.PHONY: test
test: ## Run all tests
	cd $(WEB_DIR) && pnpm test:unit --run
	cd $(SERVER_DIR) && go test -v ./...

.PHONY: lint
lint: ## Run linters
	cd $(WEB_DIR) && pnpm lint
	cd $(SERVER_DIR) && go vet ./...

# -----------------------------------------------------------------------------
# Utilities
# -----------------------------------------------------------------------------

.PHONY: clean
clean: ## Remove build artifacts
	rm -rf $(WEB_DIR)/dist
	rm -rf $(SERVER_DIR)/dist
	rm -f $(SERVER_DIR)/vibrissae

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-14s\033[0m %s\n", $$1, $$2}'
