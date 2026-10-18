#!/usr/bin/env bash
# Upload storage/media/** into the R2 bucket (remote).
# Requires: R2 enabled on the account, bucket exists, wrangler logged in with R2 scopes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUCKET="${R2_BUCKET:-cms-template-pg-multilingual-media}"
MEDIA_DIR="$ROOT/storage/media"

if [[ ! -d "$MEDIA_DIR" ]]; then
  echo "Missing $MEDIA_DIR" >&2
  exit 1
fi

echo "Syncing $MEDIA_DIR -> r2://$BUCKET (remote)"
find "$MEDIA_DIR" -type f | while read -r file; do
  key="${file#"$MEDIA_DIR"/}"
  echo "  put $key"
  npx wrangler r2 object put "$BUCKET/$key" --file="$file" --remote
done
echo "Done."
