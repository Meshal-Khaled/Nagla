#!/usr/bin/env bash
# Deploy / update Nagla on the "ring" server (ssh host `ring`), running 24/7 in Docker.
# Usage (Git Bash, from the repo root): ./deploy-ring.sh
# - uploads api, ai, devui, contracts, docker + api/.env and ai/.env to ~/ring-apps/nagla
# - (re)builds and restarts the containers; the database and photos stay in Docker volumes
# - the API listens on 127.0.0.1:4926 on ring (the tunnel / port forward for nagla.arc-homlab.com points there)
set -euo pipefail
cd "$(dirname "$0")"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar --force-local --exclude='node_modules' --exclude='.venv' --exclude='__pycache__' --exclude='.pytest_cache' \
  -czf "$TMP/nagla.tgz" api ai app devui contracts docker compose.ring.yaml .dockerignore

scp -q "$TMP/nagla.tgz" ring:/tmp/nagla-deploy.tgz
ssh ring 'set -e
  D=~/ring-apps/nagla; mkdir -p $D; cd $D
  tar -xzf /tmp/nagla-deploy.tgz && rm /tmp/nagla-deploy.tgz
  mv -f compose.ring.yaml compose.yaml
  [ -f .env ] || echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > .env
  chmod 600 .env api/.env ai/.env
  docker compose up -d --build
  docker compose ps'
