# Creating the upload key

**You run this, not the build agent and not an assistant.** The upload key is
the one secret in this repository's orbit that cannot be replaced: once Google
Play has seen it, a lost key means you can never ship an update to this listing
again, and a leaked key means someone else can. Nobody should hold it but you.

---

## 1. Create the keystore

`keytool` ships with the JDK bundled inside Android Studio, so there is nothing
to install:

```bash
"/c/Program Files/Android/Android Studio/jbr/bin/keytool" -genkeypair -v \
  -keystore android/app/upload-keystore.jks \
  -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype PKCS12
```

It will ask for a password and for your name and organisation. Use a password
from your password manager — you will need it for every release for the life of
the app.

`-validity 10000` is about 27 years. Play requires a key valid until at least
2033; there is no reason to cut it finer.

## 2. Point the build at it

Create `android/app/keystore.properties`:

```properties
storeFile=upload-keystore.jks
storePassword=<the password you just chose>
keyAlias=upload
keyPassword=<the same password, unless you set a separate key password>
```

Both `*.jks` and `keystore.properties` are in `.gitignore`. Check before your
first commit:

```bash
git status --porcelain android/app/
```

If either file shows up there, stop and fix the ignore rules before committing.

## 3. Build the signed bundle

```bash
cd android
JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

Verify it really is signed:

```bash
"/c/Program Files/Android/Android Studio/jbr/bin/jarsigner" -verify -verbose \
  android/app/build/outputs/bundle/release/app-release.aab | tail -5
```

## 4. Enrol in Play App Signing

Do this when you create the Play Console listing. Google then holds the *app
signing key* and your upload key becomes recoverable — if you lose it, support
can reset it. **Without App Signing there is no recovery path at all.**

---

## How the build behaves without the key

`android/app/build.gradle` attaches the signing config only when
`keystore.properties` exists:

```gradle
def hasSigningConfig = keystorePropertiesFile.exists()
```

So a clean checkout, or CI without secrets, still builds a release bundle — just
an unsigned one. That keeps `bundleRelease` useful for checking that the build
works without handing the production key to everyone who clones the repo. An
unsigned bundle cannot be uploaded to Play, which is the point.

---

## Backup

Store, in your password manager or an offline vault:

- `upload-keystore.jks`
- the store password
- the key password
- the alias (`upload`)

Not in the repository. Not in a shared drive the team can read. Losing this file
is the one mistake in Android release engineering that has no fix.
