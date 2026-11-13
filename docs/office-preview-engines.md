# Office document preview engines

SiliconVault converts supported Office files to PDF in the Rust/Tauri backend and renders the result with the existing PDF.js viewer. No Python, Java, or Node.js runtime is added for conversion.

## Engine selection

1. If `SILICONVAULT_DOCBUILDER_PATH` points to an ONLYOFFICE Document Builder CLI executable, SiliconVault tries it first.
2. If Document Builder fails and LibreOffice is available, SiliconVault falls back to LibreOffice.
3. If Document Builder is not configured, SiliconVault uses LibreOffice when available.

The Document Builder CLI executable is named `docbuilder.exe` on Windows and `documentbuilder` on Linux/macOS.

Example PowerShell configuration for the current process:

```powershell
$env:SILICONVAULT_DOCBUILDER_PATH = "C:\\Program Files\\ONLYOFFICE\\DocumentBuilder\\docbuilder.exe"
```

Example Linux configuration:

```bash
export SILICONVAULT_DOCBUILDER_PATH="/opt/onlyoffice/documentbuilder"
```

Restart SiliconVault after changing the environment variable.

## Licensing

The free Document Builder distribution adds a watermark to generated documents. Do not ship it as the production preview engine if that watermark is unacceptable. Before distributing Document Builder with SiliconVault, obtain and verify the appropriate commercial redistribution/OEM rights from ONLYOFFICE. SiliconVault does not bundle the Document Builder binaries.

## Resource profile

The Rust backend launches the native Document Builder CLI for each conversion and passes it a short JavaScript script. This avoids shipping a separate Python, Java, or Node.js runtime. Conversion runs on a blocking worker so it does not block Tauri's async runtime. The generated PDF and temporary script are kept in an isolated temporary directory and removed after conversion.

## Supported preview flow

The output PDF is opened by the existing PDF.js viewer. This preserves a single rendering path for Word documents and PowerPoint presentations, including selectable PDF text where the source document exposes text. Conversion fidelity remains dependent on the source file and the installed engine/fonts.
