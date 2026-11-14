# Office document preview engines

SiliconVault uses an embedded-WebView Rust/WebAssembly renderer for modern OOXML documents and retains native Office-to-PDF conversion as a compatibility fallback. Converted PDFs use the existing PDF.js viewer. The browser renderer does not require a Python, Java, or Node.js application runtime.

## Embedded-WebView OOXML rendering

Modern Office Open XML files use the pinned `@silurus/ooxml` package (MIT) and render locally in the Tauri/WebView frontend:

| Extensions | Primary renderer |
| --- | --- |
| `.docx`, `.docm` | `DocxScrollViewer` |
| `.xlsx`, `.xlsm` | `XlsxViewer` |
| `.pptx`, `.pptm` | `PptxScrollViewer` |

The viewer modules are dynamically imported only when a matching file is opened. The package uses Rust-compiled WebAssembly parsers and Canvas rendering; it does not upload document contents. Worker rendering is selected when the WebView exposes both `Worker` and `OffscreenCanvas`; otherwise parsing remains worker-based and painting uses the main thread. Optional Google Fonts are disabled, and PowerPoint hyperlinks are disabled in the preview.

The application keeps a 100 MiB input limit. The renderer also applies its own ZIP-entry, inflated-size, entry-count, decoded-image, and worksheet resource limits. Macro-enabled files are only viewed: SiliconVault does not execute VBA macros.

The package is pinned to an exact version rather than a floating range. Its upstream README discloses that the codebase was implemented primarily by AI coding agents and is a rapidly evolving project. Treat this as a renderer dependency that needs ongoing review: run `npm audit`, verify npm registry signatures/provenance where available, and maintain representative visual regression fixtures before production releases. The package is MIT-licensed, but its supported feature matrix is not a guarantee of pixel-identical Microsoft Office output.

## Legacy and non-OOXML formats

Legacy binary formats (`.doc`, `.xls`, `.ppt`) and OpenDocument/RTF formats (`.odt`, `.ods`, `.odp`, `.rtf`, and related variants) continue through the native PDF conversion pipeline below. The same conversion path is used when embedded-WebView OOXML rendering fails in the desktop application. If no conversion engine is installed, the preview reports that dependency instead of showing a misleading partial rendering.

## Engine selection

1. If `SILICONVAULT_DOCBUILDER_PATH` points to an ONLYOFFICE Document Builder CLI executable, SiliconVault tries it first.
2. If Document Builder fails and LibreOffice is available, SiliconVault falls back to LibreOffice.
3. If Document Builder is not configured, SiliconVault uses LibreOffice when available.

The official CLI executable names are `docbuilder.exe` on Windows and `documentbuilder` on Linux. Document Builder runs UTF-8 JavaScript files directly; the integration uses the documented `builderJS.OpenFile`, `builderJS.SaveFile`, and `builderJS.CloseFile` API.

Example PowerShell configuration for the current process:

```powershell
$env:SILICONVAULT_DOCBUILDER_PATH = "C:\Program Files\ONLYOFFICE\DocumentBuilder\docbuilder.exe"
```

Example Linux configuration:

```bash
export SILICONVAULT_DOCBUILDER_PATH="/opt/onlyoffice/documentbuilder"
```

Restart SiliconVault after changing the environment variable.

## Real conversion smoke test (Windows)

Install/extract the Document Builder SDK for the target architecture, then run:

```powershell
pwsh -NoProfile -File scripts/test-onlyoffice-document-builder.ps1 -DocumentBuilderPath "$env:SILICONVAULT_DOCBUILDER_PATH"
```

The test asks Document Builder to create a small DOCX and PPTX fixture, reopens each fixture, converts both to PDF, and validates the PDF signature and non-empty output. It exits non-zero if the executable fails or either PDF is missing/invalid. Add `-KeepArtifacts` to retain the generated files for inspection.

This smoke test verifies the installed Document Builder CLI and its DOCX/PPTX import-to-PDF path. It does not replace testing with representative user documents, complex layouts, embedded fonts, charts, equations, or large presentations. The script has been added but has not been run against an installed Document Builder runtime in the repository's CI environment.

## Licensing and redistribution

- The current free Document Builder release adds a watermark to generated documents. ONLYOFFICE states that a commercial license is required to remove it. See the [official installation guide](https://api.onlyoffice.com/docs/document-builder/get-started/installing).
- ONLYOFFICE community staff have confirmed that pre-8.3 Document Builder 8.2.0 compiled binaries may be redistributed under AGPLv3, provided the applicable AGPL obligations are met, including making corresponding source available and retaining required notices. That confirmation is version-specific; do not apply it to 8.3 or later releases.
- The 8.2.0 route avoids the newer free-version watermark but is an older engine. It requires a separate security/maintenance review before shipping.
- SiliconVault currently does not bundle any Document Builder binaries. Before bundling a runtime, choose between a commercial licence for a supported current release or a specifically reviewed AGPLv3 distribution of an eligible release. Review all third-party components and notices in the SDK, not only the main executable. Do not treat this engineering note as legal advice.

Relevant references:
- [Document Builder CLI overview](https://api.onlyoffice.com/docs/document-builder/using-cli/overview)
- [Document Builder script file/API](https://api.onlyoffice.com/docs/document-builder/using-cli/script-file)
- [ONLYOFFICE Document Builder source and licence](https://github.com/ONLYOFFICE/DocumentBuilder)
- [ONLYOFFICE staff clarification on 8.2.0 redistribution](https://community.onlyoffice.com/t/clarification-on-redistributing-document-builder-8-2-binaries/20427)

## Resource profile

The Rust backend launches the native Document Builder CLI for each conversion and passes it a short JavaScript script. This avoids adding another application-language runtime. Conversion runs on a blocking worker so it does not block Tauri's async runtime. The generated PDF and temporary script are kept in an isolated temporary directory and removed after conversion.

## Supported preview flow

Office-to-PDF fallback output is opened by the existing PDF.js viewer. Modern OOXML documents normally render directly through the embedded-WebView package above. Conversion fidelity remains dependent on the source file, installed engine version, and available fonts.
