# Windows PowerShell launcher for CodeLens Tutor
$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"

Write-Host "=== Starting CodeLens Tutor ===" -ForegroundColor Cyan

$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    Write-Host "[Backend] Creating Python virtual environment..."
    python -m venv (Join-Path $BackendDir ".venv")
}

& $VenvPython -c "import fastapi, uvicorn, httpx, pydantic" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[Backend] Installing Python dependencies..."
    & $VenvPython -m pip install -r (Join-Path $BackendDir "requirements.txt")
}

if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
    Write-Host "[Frontend] Installing Node dependencies..."
    Push-Location $FrontendDir
    npm install
    Pop-Location
}

$BindHost = if ($env:HOST) { $env:HOST } else { "127.0.0.1" }

$BackendProc = Start-Process -FilePath $VenvPython -ArgumentList "-m", "uvicorn", "app.main:app", "--host", $BindHost, "--port", "8000", "--reload" -WorkingDirectory $BackendDir -PassThru -NoNewWindow
$FrontendProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "--host", $BindHost, "--port", "5173" -WorkingDirectory $FrontendDir -PassThru -NoNewWindow

Write-Host ""
Write-Host "CodeLens Tutor is running:" -ForegroundColor Green
Write-Host "  Frontend: http://$($BindHost):5173"
Write-Host "  Backend:  http://$($BindHost):8000/docs"
Write-Host "Press Ctrl+C to stop."

try {
    Wait-Process -Id $BackendProc.Id, $FrontendProc.Id
} finally {
    if (-not $BackendProc.HasExited) { Stop-Process -Id $BackendProc.Id -Force -ErrorAction SilentlyContinue }
    if (-not $FrontendProc.HasExited) { Stop-Process -Id $FrontendProc.Id -Force -ErrorAction SilentlyContinue }
}
