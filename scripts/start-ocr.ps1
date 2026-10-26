param([string]$Python = $env:OCR_PYTHON)
$ErrorActionPreference = 'Stop'
if (-not $Python) {
    $localPython = Join-Path $PSScriptRoot '..\.data\ocr-venv\Scripts\python.exe'
    if (Test-Path 'D:\WarrantyVault-ocr\venv\Scripts\python.exe') {
        $Python = 'D:\WarrantyVault-ocr\venv\Scripts\python.exe'
    } elseif (Test-Path $localPython) {
        $Python = $localPython
    } else {
        throw 'Set OCR_PYTHON to your OCR virtual environment Python. See docs/LOCAL_OCR.md.'
    }
}
& $Python (Join-Path $PSScriptRoot '..\services\ocr\service.py')
exit $LASTEXITCODE
