[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$DocumentBuilderPath,
    [switch]$KeepArtifacts
)

$ErrorActionPreference = 'Stop'
$resolvedBuilder = (Resolve-Path -LiteralPath $DocumentBuilderPath).Path
if (-not (Test-Path -LiteralPath $resolvedBuilder -PathType Leaf)) {
    throw "Document Builder executable not found: $DocumentBuilderPath"
}

$workDirectory = Join-Path ([IO.Path]::GetTempPath()) ("SiliconVault-DocumentBuilder-Smoke-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $workDirectory | Out-Null

function Invoke-DocumentBuilderScript {
    param([string]$ScriptPath)
    $builderOutput = & $resolvedBuilder $ScriptPath 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw ("Document Builder exited with code {0}.{1}{2}" -f $exitCode, [Environment]::NewLine, ($builderOutput -join [Environment]::NewLine))
    }
}

function Assert-PdfOutput {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Expected PDF was not created: $Path"
    }
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 5 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 5) -ne '%PDF-') {
        throw "Output is not a valid PDF header: $Path"
    }
    Write-Host ("PASS: {0} ({1:N0} bytes)" -f [IO.Path]::GetFileName($Path), $bytes.Length)
}

try {
    $docxPath = Join-Path $workDirectory 'smoke-test.docx'
    $pptxPath = Join-Path $workDirectory 'smoke-test.pptx'
    $docxPdf = Join-Path $workDirectory 'smoke-test-docx.pdf'
    $pptxPdf = Join-Path $workDirectory 'smoke-test-pptx.pdf'

    $docxLiteral = ConvertTo-Json -InputObject $docxPath -Compress
    $pptxLiteral = ConvertTo-Json -InputObject $pptxPath -Compress

    $fixtureScript = @'
builderJS.CreateFile("docx");
const document = Api.GetDocument();
const paragraph = document.GetElement(0);
paragraph.AddText("SiliconVault DOCX conversion smoke test");
if (!builderJS.SaveFile("docx", __DOCX_PATH__)) throw new Error("Could not create DOCX fixture");
builderJS.CloseFile();

builderJS.CreateFile("pptx");
const presentation = Api.GetPresentation();
const slide = presentation.GetSlideByIndex(0);
slide.RemoveAllObjects();
const shape = Api.CreateShape("rect", 8000000, 1000000, Api.CreateNoFill(), Api.CreateStroke(0, Api.CreateNoFill()));
shape.SetPosition(500000, 500000);
const content = shape.GetDocContent();
content.RemoveAllElements();
const slideParagraph = Api.CreateParagraph();
slideParagraph.AddText("SiliconVault PPTX conversion smoke test");
content.Push(slideParagraph);
slide.AddObject(shape);
if (!builderJS.SaveFile("pptx", __PPTX_PATH__)) throw new Error("Could not create PPTX fixture");
builderJS.CloseFile();
'@
    $fixtureScript = $fixtureScript.Replace('__DOCX_PATH__', $docxLiteral).Replace('__PPTX_PATH__', $pptxLiteral)
    $fixtureScriptPath = Join-Path $workDirectory 'create-fixtures.js'
    [IO.File]::WriteAllText($fixtureScriptPath, $fixtureScript, [Text.UTF8Encoding]::new($false))
    Invoke-DocumentBuilderScript -ScriptPath $fixtureScriptPath

    foreach ($item in @(
        @{ Input = $docxPath; Output = $docxPdf; Name = 'DOCX' },
        @{ Input = $pptxPath; Output = $pptxPdf; Name = 'PPTX' }
    )) {
        $inputLiteral = ConvertTo-Json -InputObject $item.Input -Compress
        $outputLiteral = ConvertTo-Json -InputObject $item.Output -Compress
        $conversionScript = @'
if (!builderJS.OpenFile(__INPUT_PATH__)) throw new Error("Could not open Office input");
try {
    if (!builderJS.SaveFile("pdf", __OUTPUT_PATH__)) throw new Error("Could not save PDF output");
} finally {
    builderJS.CloseFile();
}
'@
        $conversionScript = $conversionScript.Replace('__INPUT_PATH__', $inputLiteral).Replace('__OUTPUT_PATH__', $outputLiteral)
        $scriptPath = Join-Path $workDirectory ("convert-" + $item.Name.ToLowerInvariant() + '.js')
        [IO.File]::WriteAllText($scriptPath, $conversionScript, [Text.UTF8Encoding]::new($false))
        Invoke-DocumentBuilderScript -ScriptPath $scriptPath
        Assert-PdfOutput -Path $item.Output
    }

    Write-Host 'ONLYOFFICE Document Builder DOCX/PPTX conversion smoke tests passed.'
    Write-Host "Artifacts: $workDirectory"
}
finally {
    if (-not $KeepArtifacts) {
        Remove-Item -LiteralPath $workDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
}
