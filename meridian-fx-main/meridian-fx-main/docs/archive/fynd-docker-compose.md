# Fynd With Docker Compose

This repo runs Fynd as a standalone service via Docker Compose so app code can stay local in the monorepo.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `TYCHO_API_KEY`.
3. Optionally replace `RPC_URL` with a dedicated provider.
4. Start Fynd:

```bash
docker compose up -d fynd
```

## Verify

```bash
curl http://localhost:3000/v1/health
curl http://localhost:9898/metrics
```

## Useful commands

```bash
docker compose logs -f fynd
docker compose restart fynd
docker compose down
```

## Notes

- The service defaults to `FYND_CHAIN=ethereum`.
- For hackathon speed, this setup keeps Fynd close to the upstream quickstart and avoids adding Rust to the monorepo.
- If we want a Uniswap-only setup later, we can extend the `command` in `compose.yaml` with `--protocols uniswap_v2,uniswap_v3`.
