# Creating the upload key

**You run this, not the build agent and not an assistant.** The upload key is
the one secret in this repository's orbit that cannot be replaced: once Google
Play has seen it, a lost key means you can never ship an update to this listing
again, and a leaked key means someone else can. Nobody should hold it but you.

---

## 1. Create the keystore

`keytool` ships with any JDK. On this machine it is already on `PATH`
(Homebrew OpenJDK 17), so run it from the repository root:

```bash
tools/create-upload-key.sh
```

It prompts you for a password, generates the key, writes `keystore.properties`
mode 600, verifies the result and checks git cannot see either file. The
password is handed to `keytool` through the environment rather than as an
argument, because argv is readable by any process on the machine through `ps`.
It refuses outright if a keystore already exists — overwriting one Play has
seen ends your ability to update the listing, and that is not a prompt anyone
should be able to click through.

Or do it by hand, which is all the script does:

```bash
keytool -genkeypair -v -keystore android/app/upload-keystore.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000 -storetype PKCS12
```

If `keytool: command not found`, point at a JDK explicitly — Android Studio
bundles one at `/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool`.

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

`*.jks`, `*.keystore` and `keystore.properties` are all in `android/.gitignore`.
Check anyway before your first commit:

```bash
git status --porcelain android/app/
```

If either file shows up there, stop and fix the ignore rules before committing.

## 3. Build the signed bundle

```bash
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew bundleRelease
```

**Do not use `/usr/libexec/java_home` here.** Capacitor 8 compiles its plugins
at Java 21. Homebrew's `openjdk@21` is installed on this machine but keg-only,
so it was never symlinked into `/Library/Java/JavaVirtualMachines` — and
`java_home` does not report that as an error. It quietly returns the 17 it can
see, including for `java_home -v 21`, so the build dies at
`:capacitor-camera:compileReleaseJavaWithJavac` with "Cannot find a Java
installation ... matching {languageVersion=21}" while the command looks right.

The explicit path above avoids it. To fix it at the source instead:

```bash
sudo ln -sfn /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-21.jdk
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

Verify it really is signed:

```bash
jarsigner -verify -verbose android/app/build/outputs/bundle/release/app-release.aab | tail -5
```

An unsigned bundle prints `jar is unsigned`; a signed one prints `jar verified`.

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
