# Bundled local OCR models

Unmodified `eng.traineddata` and `ron.traineddata` from the official
[tesseract-ocr/tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast/tree/87416418657359cb625c412a48b6e1d6d41c29bd)
commit `87416418657359cb625c412a48b6e1d6d41c29bd`. Apache 2.0; see LICENSE.
No model downloads occur at application runtime. Both files are included in Git
and the API Docker image. Combined size: 6,489,411 bytes.

SHA-256:

- eng.traineddata: `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`
- ron.traineddata: `9adfde6b51ba4b97efd10ea37c3070fd3fc2bad7815e81f5c3c198cd96216cc9`

The pinned PyMuPDF wheel supplies the Tesseract integration. A separate Tesseract
CLI was not needed on the tested macOS arm64 and Linux arm64 wheels. Source-built
or other platform installations may require a Tesseract-enabled MuPDF build.
