#!/bin/sh
# Atualizador do Sendtec.
# Roda num container com acesso ao Docker do servidor. A aplicação só escreve pedidos em $UPDATES_DIR:
#   check   -> procurar versão nova agora
#   request -> atualizar (git pull + rebuild do app)
# e lê status.json / run.json / update.log.
set -u
DIR="${UPDATES_DIR:-/updates}"
REPO="${REPO_DIR:?REPO_DIR não definido}"
command -v git >/dev/null && command -v jq >/dev/null || apk add --no-cache git jq >/dev/null 2>&1
git config --global --add safe.directory '*'
mkdir -p "$DIR"
cd "$REPO" || exit 1

now() { date -Iseconds; }

status() {
  branch=$(git rev-parse --abbrev-ref HEAD)
  err=$(git fetch --quiet origin "$branch" 2>&1 | tail -1)
  current=$(git rev-parse --short HEAD)
  latest=$(git rev-parse --short "origin/$branch" 2>/dev/null || echo "$current")
  behind=$(git rev-list --count "HEAD..origin/$branch" 2>/dev/null || echo 0)
  changes=$(git log --format='%h%x09%cI%x09%s' "HEAD..origin/$branch" 2>/dev/null | head -50 |
    jq -R -s 'split("\n") | map(select(length > 0) | split("\t") | {hash: .[0], date: .[1], message: (.[2:] | join("\t"))})')
  jq -n --arg branch "$branch" --arg current "$current" --arg currentDate "$(git log -1 --format=%cI)" \
    --arg latest "$latest" --argjson behind "${behind:-0}" --argjson changes "${changes:-[]}" \
    --arg checkedAt "$(now)" --arg error "$err" \
    '{branch: $branch, current: $current, currentDate: $currentDate, latest: $latest, behind: $behind,
      changes: $changes, checkedAt: $checkedAt, error: (if $error == "" then null else $error end)}' > "$DIR/status.json.tmp" &&
    mv "$DIR/status.json.tmp" "$DIR/status.json"
}

apply() {
  by=$(jq -r '.by // "?"' "$DIR/request" 2>/dev/null)
  rm -f "$DIR/request"
  jq -n --arg by "$by" --arg startedAt "$(now)" --arg from "$(git rev-parse --short HEAD)" \
    '{state: "running", by: $by, from: $from, startedAt: $startedAt}' > "$DIR/run.json"
  echo "[$(now)] Atualização pedida por $by" > "$DIR/update.log"
  if git pull --ff-only >> "$DIR/update.log" 2>&1 &&
    docker compose up -d --build app backup >> "$DIR/update.log" 2>&1; then
    state=done
  else
    state=failed
  fi
  echo "[$(now)] Fim: $state" >> "$DIR/update.log"
  jq --arg state "$state" --arg finishedAt "$(now)" --arg to "$(git rev-parse --short HEAD)" \
    '.state = $state | .finishedAt = $finishedAt | .to = $to' "$DIR/run.json" > "$DIR/run.json.tmp" && mv "$DIR/run.json.tmp" "$DIR/run.json"
  status
}

echo "Atualizador do Sendtec pronto ($REPO)"
status
last=$(date +%s)
while true; do
  [ -f "$DIR/request" ] && apply
  if [ -f "$DIR/check" ] || [ $(($(date +%s) - last)) -ge 1800 ]; then
    rm -f "$DIR/check"
    status
    last=$(date +%s)
  fi
  [ -n "${UPDATER_ONCE:-}" ] && exit 0
  sleep 5
done
