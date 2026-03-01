# Build stage
FROM golang:1.24-alpine AS builder

# Version can be overridden at build time
ARG VERSION=dev

WORKDIR /build

# Copy go mod files first for caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build
COPY . .
RUN CGO_ENABLED=0 go build -ldflags "-s -w -X main.Version=${VERSION}" -o vibrissae .

# Runtime stage - minimal image
FROM alpine:3.20

# Install ca-certificates for HTTPS (Let's Encrypt, etc.)
RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

# Copy binary
COPY --from=builder /build/vibrissae .

# Create directories for certs and logs
RUN mkdir -p /app/certs /app/local_certs

# Expose documentation (host network mode ignores this, but good for reference)
# TCP: 80 (ACME), 443 (HTTPS), 8080 (proxy mode), 8443 (local mode)
# UDP: 3478 (TURN)
EXPOSE 80/tcp 443/tcp 8080/tcp 8443/tcp 3478/udp

# Run
ENTRYPOINT ["./vibrissae"]
