#!/usr/bin/env bash
# Point every public support / deletion contact at a real mailbox.
#
# The account-deletion page's primary mechanism is a mailto: link, and Play
# reviewers do send mail to it. An address that bounces reads as a broken
# deletion route, which is a listing rejection rather than a cosmetic bug — so
# this is one command rather than a hunt through three HTML files.
#
# Usage: tools/set-support-email.sh new@example.com
set -euo pipefail

NEW="${1:-}"
if [[ -z "$NEW" ]]; then
  echo "usage: $0 <support-email>" >&2
  exit 64
fi
if [[ ! "$NEW" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
  echo "error: '$NEW' does not look like an email address" >&2
  exit 64
fi

cd "$(dirname "$0")/.."

# Current address is read from the pages themselves, so this stays correct after
# it has been run once and there is no stale constant to forget to update.
OLD="$(grep -rhoE '[A-Za-z0-9._%+-]+@indianformhelper\.app|[A-Za-z0-9._%+-]+@gmail\.com' \
        docs/hosted src/app/features/privacy-policy 2>/dev/null | sort -u | head -1 || true)"

if [[ -z "$OLD" ]]; then
  echo "error: could not find the current support address to replace" >&2
  exit 1
fi
if [[ "$OLD" == "$NEW" ]]; then
  echo "already set to $NEW"
  exit 0
fi

FILES=$(grep -rlF "$OLD" docs/hosted src/app docs/PLAY_STORE.md 2>/dev/null || true)
if [[ -z "$FILES" ]]; then
  echo "error: no files contain $OLD" >&2
  exit 1
fi

# %40 is the URL-encoded form used inside Angular templates.
OLD_ENC="${OLD/@/&#64;}"
NEW_ENC="${NEW/@/&#64;}"

while IFS= read -r f; do
  perl -pi -e "s/\Q$OLD\E/$NEW/g; s/\Q$OLD_ENC\E/$NEW_ENC/g" "$f"
  echo "  updated $f"
done <<< "$FILES"

echo
echo "support address: $OLD -> $NEW"
echo "remaining references to the old address:"
grep -rn "$OLD" docs src 2>/dev/null || echo "  none"
