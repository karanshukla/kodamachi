FROM golang:1.26-alpine AS builder

WORKDIR /src

COPY go.mod go.sum* ./
RUN go mod download

COPY . .

# CGO off for the static distroless runtime.
ENV CGO_ENABLED=0 GOOS=linux
RUN go build -trimpath -ldflags="-s -w" -o /out/shim ./cmd/shim

# Embedded Caddy (internal/shim/caddyproxy.go) pulls in caddytls and its
# ACME/KMS dependency tree (~13MB -> ~78MB binary). None of it runs: TLS is off
# on the embedded engine and the service sits behind Anubis + the outer Caddy.
#
# Root variant, not :nonroot: Railway mounts volumes root-owned, so uid 65532
# cannot create /data/og-cache and the cache init fails with EACCES.
FROM gcr.io/distroless/static-debian12

WORKDIR /
COPY --from=builder /out/shim /shim

EXPOSE 8080
ENTRYPOINT ["/shim"]
