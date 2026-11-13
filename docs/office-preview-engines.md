# Office document preview engines

SiliconVault converts supported Office files to PDF in the Rust/Tauri backend and renders the result with the existing PDF.js viewer. The conversion integration does not add a Python, Java, or Node.js runtime to SiliconVault.

## Engine selection

1. If `SILICONVAULT_DOCBUILDER_PATH` points to an ONLYOFFICE Document Builder CLI executable, SiliconVault tries it first.
2. If Document Builder fails and LibreOffice is available, SiliconVault falls back to LibreOffice.
3. If Document Builder is not configured, SiliconVault uses LibreOffice when available.

The official CLI executable names are `docbuilder.exe` on Windows and `documentbuilder` on Linux/macOS. Document Builder runs UTF-8 JavaScript files directly; the integration uses the documented `builderJS.OpenFile`, `builderJS.SaveFile`, and `builderJS.CloseFile` API.

Example PowerShell configuration for the current process:

```powershell
$env:SILICONVAULT_DOCBUILDER_PATH = "C:\\Program Files\\ONLYOFFICE\\DocumentBuilder\\docbuilder.exe"
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

The output PDF is opened by the existing PDF.js viewer. This preserves a single rendering path for Word documents and PowerPoint presentations, including selectable PDF text where the source document exposes text. Conversion fidelity remains dependent on the source file, installed engine version, and available fonts.
