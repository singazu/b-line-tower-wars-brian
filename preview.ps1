param(
  [int]$Port = 5500,
  [int]$MaxPortTries = 20
)

$ErrorActionPreference = "Stop"

function Get-ContentType {
  param([string]$FilePath)

  switch ([System.IO.Path]::GetExtension($FilePath).ToLowerInvariant()) {
    ".html" { return "text/html; charset=utf-8" }
    ".css" { return "text/css; charset=utf-8" }
    ".js" { return "application/javascript; charset=utf-8" }
    ".json" { return "application/json; charset=utf-8" }
    ".png" { return "image/png" }
    ".jpg" { return "image/jpeg" }
    ".jpeg" { return "image/jpeg" }
    ".gif" { return "image/gif" }
    ".svg" { return "image/svg+xml" }
    ".ico" { return "image/x-icon" }
    default { return "application/octet-stream" }
  }
}

function Send-HttpResponse {
  param(
    [Parameter(Mandatory = $true)]$Stream,
    [int]$StatusCode,
    [string]$Reason,
    [byte[]]$BodyBytes,
    [string]$ContentType = "text/plain; charset=utf-8"
  )

  $header = "HTTP/1.1 $StatusCode $Reason`r`nContent-Type: $ContentType`r`nContent-Length: $($BodyBytes.Length)`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($BodyBytes.Length -gt 0) {
    $Stream.Write($BodyBytes, 0, $BodyBytes.Length)
  }
}

$rootPath = [System.IO.Path]::GetFullPath($PSScriptRoot)

Write-Host "Starting local preview server for simple-clicker-game..." -ForegroundColor Cyan
Write-Host "Project folder: $rootPath"
Write-Host "Starting port: $Port"

$listener = $null
$activePort = $Port
$started = $false

for ($i = 0; $i -lt $MaxPortTries; $i++) {
  $candidatePort = $Port + $i
  $candidate = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidatePort)
  try {
    $candidate.Start()
    $listener = $candidate
    $activePort = $candidatePort
    $started = $true
    break
  } catch {
    $candidate.Stop()
  }
}

if (-not $started) {
  Write-Host ""
  Write-Host "Could not start local server on ports $Port to $($Port + $MaxPortTries - 1)." -ForegroundColor Red
  Write-Host "Try a different start port: .\preview.ps1 -Port 5600"
  exit 1
}

$url = "http://127.0.0.1:$activePort"
if ($activePort -ne $Port) {
  Write-Host "Port $Port was busy, switched to port $activePort."
}

Write-Host ""
Write-Host "Server is running. Keep this window open." -ForegroundColor Green
Write-Host "Open this URL in your browser: $url"
Write-Host "Press Ctrl + C to stop."
Write-Host ""

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()

    try {
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)

      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) {
        continue
      }

      $parts = $requestLine.Split(" ")
      $requestPath = "/"
      if ($parts.Length -ge 2) {
        $requestPath = [Uri]::UnescapeDataString($parts[1])
      }

      while (($line = $reader.ReadLine()) -ne $null -and $line -ne "") {
      }

      if ($requestPath -eq "/") {
        $requestPath = "/index.html"
      }

      $relativePath = $requestPath.TrimStart("/").Replace("/", "\")
      $fullPath = [System.IO.Path]::GetFullPath((Join-Path $rootPath $relativePath))

      if (-not $fullPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden")
        Send-HttpResponse -Stream $stream -StatusCode 403 -Reason "Forbidden" -BodyBytes $bytes
        continue
      }

      if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($fullPath)
        $contentType = Get-ContentType -FilePath $fullPath
        Send-HttpResponse -Stream $stream -StatusCode 200 -Reason "OK" -BodyBytes $bytes -ContentType $contentType
      } else {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        Send-HttpResponse -Stream $stream -StatusCode 404 -Reason "Not Found" -BodyBytes $bytes
      }
    } finally {
      if ($client.Connected) {
        $client.Close()
      }
    }
  }
} finally {
  if ($listener) {
    $listener.Stop()
  }
}
