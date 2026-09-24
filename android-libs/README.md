# Patched Android PDF Viewer

`AndroidPdfViewer-4.0.1-tillnote.aar` is built from
`zacharee/AndroidPdfViewer` tag `4.0.1` (commit
`da4033ed047c937c5bee3149005d25f4851372b6`). The upstream project is
licensed under Apache License 2.0; its license is included beside the AAR.

Changes only `RenderingHandler` lifecycle safety:

- make its `running` flag `volatile`;
- ignore work when the handler has stopped or `PdfFile` is absent;
- drop a render task that races with `PDFView.recycle()`.

The guard prevents stale Android renderer work from calling a disposed PDF
document during rapid PDF/CSV switching or preview close/re-entry.

SHA-256: `6cc2b4e467d3a7ccda68d49d1810e5b8aac0e1f3783869af54a5e1f84abadd30`

## Rebuild

From PowerShell with Android SDK and JDK available:

```powershell
git clone https://github.com/zacharee/AndroidPdfViewer.git
cd AndroidPdfViewer
git checkout da4033ed047c937c5bee3149005d25f4851372b6
git apply "<repo>\android-libs\AndroidPdfViewer-4.0.1-tillnote.patch"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
.\gradlew.bat :android-pdf-viewer:assembleRelease --no-daemon
Get-FileHash .\android-pdf-viewer\build\outputs\aar\android-pdf-viewer-release.aar -Algorithm SHA256
```

The resulting AAR must match the SHA-256 above before replacing the committed
artifact.
