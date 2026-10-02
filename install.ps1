if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error 'Node.js 18+ and npm are required. Install with: winget install --id OpenJS.NodeJS.LTS --exact --source winget'
    exit 1
}
& node (Join-Path $PSScriptRoot 'src\cli.mjs') setup @args
exit $LASTEXITCODE
