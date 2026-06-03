# SDS Capacitor Android Proof

This proof shell is isolated from the main SDS package. It points Capacitor at the built `../../dist` artifact and records how far the local Android host can go.

Commands:

```bash
npm install
cd ../..
npm run build:native
cd sandbox/native-capacitor-proof
npx cap add android
npm run sync:android
npm run proof
npm run proof:renderers
```

On the Cycle 53 proof host, Android runtime proof used a local proof-only Temurin JDK under `../../cycle53-validation/native/android-host/jdk/`, Android SDK at `%LOCALAPPDATA%/Android/Sdk`, and emulator `SDSProof_API35`.

Runtime proof commands used after `npm run sync:android`:

```bash
.\android\gradlew.bat -p android assembleDebug
adb -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 shell am start -n com.sheepdogsim.nativeproof/.MainActivity
```

The validator is green only when it can see the built APK, a connected device/emulator, and the captured Android menu/loading/gameplay/touch-input screenshots.

The renderer proof connects to the running debug WebView over CDP. It records explicit `renderer=webgl` and `renderer=webgpu` behavior. On the Cycle 53 API 35 emulator, WebGL passed and WebGPU fell back to WebGL with `webgpu-adapter-unavailable`.

Proof output is written to `../../cycle53-validation/native/capacitor-android/`.
