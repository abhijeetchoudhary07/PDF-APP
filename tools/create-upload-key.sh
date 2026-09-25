#!/usr/bin/env bash
# Create the Google Play upload key, and wire the Gradle build to it.
#
# You run this. The password is read from your terminal into this script's
# memory and handed to keytool through the environment -- it is never passed as
# a command-line argument (argv is world-readable through `ps`), never echoed,
# and never written anywhere except android/app/keystore.properties, which is
# gitignored and created mode 600.
#
# The upload key cannot be rotated once Google Play has seen it. Lose the file
# or the password and you can never publish an update to the listing again;
# leak them and someone else can. Back both up before you do anything else.
#
# Usage: tools/create-upload-key.sh
set -euo pipefail

cd "$(dirname "$0")/.."

KEYSTORE="android/app/upload-keystore.jks"
PROPS="android/app/keystore.properties"
ALIAS="upload"

# ---------------------------------------------------------------- preflight

# Overwriting an existing keystore destroys the only key Play will accept for
# this listing, so this refuses rather than prompting -- a "are you sure?" is
# exactly the prompt people click through.
if [[ -e "$KEYSTORE" ]]; then
  echo "error: $KEYSTORE already exists." >&2
  echo "       Refusing to overwrite it. If Play has seen this key, replacing" >&2
  echo "       it ends your ability to update the listing. Move it aside" >&2
  echo "       deliberately if you really mean to start over." >&2
  exit 1
fi
if [[ -e "$PROPS" ]]; then
  echo "error: $PROPS already exists; not overwriting." >&2
  exit 1
fi

KEYTOOL="$(command -v keytool || true)"
if [[ -z "$KEYTOOL" ]]; then
  for candidate in \
    /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin/keytool \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool"; do
    [[ -x "$candidate" ]] && KEYTOOL="$candidate" && break
  done
fi
if [[ -z "$KEYTOOL" ]]; then
  echo "error: keytool not found. It ships with any JDK." >&2
  exit 1
fi

# The files must already be unignorable before one of them holds a private key.
for f in "$KEYSTORE" "$PROPS"; do
  if ! git check-ignore -q "$f" 2>/dev/null; then
    echo "error: $f is NOT gitignored. Fix android/.gitignore first --" >&2
    echo "       committing an upload key is not recoverable by deleting it." >&2
    exit 1
  fi
done

# ---------------------------------------------------------------- password

echo "Creating the Play upload key."
echo
echo "Choose a password from your password manager. You will need it for every"
echo "release for the life of this app, and there is no reset."
echo

read -rsp "Password: " KSPASS; echo
if [[ ${#KSPASS} -lt 6 ]]; then
  echo "error: keytool requires at least 6 characters." >&2
  exit 1
fi
read -rsp "Confirm:  " KSPASS_CONFIRM; echo
if [[ "$KSPASS" != "$KSPASS_CONFIRM" ]]; then
  echo "error: passwords do not match." >&2
  exit 1
fi
unset KSPASS_CONFIRM
echo

# ---------------------------------------------------------------- generate

# -storepass:env keeps the password out of argv. keytool still prompts for the
# distinguished name interactively, which is what you want -- those values end
# up in the certificate.
#
# -validity 10000 is about 27 years. Play requires a key valid past 2033.
export KSPASS
"$KEYTOOL" -genkeypair -v \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -storetype PKCS12 \
  -storepass:env KSPASS \
  -keypass:env KSPASS

chmod 600 "$KEYSTORE"

# ---------------------------------------------------------------- wire gradle

umask 077
cat > "$PROPS" <<EOF
# Read by android/app/build.gradle. Gitignored, and mode 600.
# Back this password up in your password manager -- it cannot be recovered.
storeFile=$(basename "$KEYSTORE")
storePassword=$KSPASS
keyAlias=$ALIAS
keyPassword=$KSPASS
EOF
chmod 600 "$PROPS"

# ---------------------------------------------------------------- verify

echo
echo "Verifying the keystore:"
"$KEYTOOL" -list -v -keystore "$KEYSTORE" -alias "$ALIAS" -storepass:env KSPASS 2>/dev/null \
  | grep -E "Alias name|Creation date|Entry type|Valid from" || true

unset KSPASS

echo
echo "Checking git cannot see either file:"
git status --porcelain android/app/ | grep -E "upload-keystore|keystore.properties" \
  && { echo "  !! STOP: git can see them. Fix .gitignore before committing."; exit 1; } \
  || echo "  clean -- neither file is visible to git."

cat <<'DONE'

Done. Two things, now, before you forget:

  1. Back up android/app/upload-keystore.jks and its password to your password
     manager or an offline vault. Not the repository. Not a shared drive.

  2. When you create the Play Console listing, enrol in Play App Signing.
     Google then holds the app signing key and this upload key becomes
     recoverable through support. Without it there is no recovery path at all.

Build the signed bundle:

  npm run build && npx cap sync android
  cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew bundleRelease
  jarsigner -verify android/app/build/outputs/bundle/release/app-release.aab | tail -3

"jar verified" is the pass.
DONE
