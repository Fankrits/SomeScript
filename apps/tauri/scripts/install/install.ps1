# Force TLS 1.2 on PowerShell 5.1 (older Windows versions may default to SSLv3 / TLS 1.0)
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor [System.Net.SecurityProtocolType]::Tls12

# This file is run with `irm ... | iex`, i.e. inside the user's own session: never `exit` (it would close their
# terminal) and keep preference variables local to the function. Failures are `throw`s.
function Install-SomeScript {
    $ErrorActionPreference = 'Stop'

    # Check architecture: 64-bit Windows only
    if (-not [System.Environment]::Is64BitOperatingSystem) {
        throw "SomeScript for Windows is only available for 64-bit systems."
    }

    $baseUrl = if ($env:SOMESCRIPT_BASE_URL) {
        $env:SOMESCRIPT_BASE_URL.TrimEnd('/')
    } else {
        "https://github.com/Fankrits/SomeScript/releases/latest/download"
    }

    $assetName = "SomeScript-windows-x64-setup.exe"
    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("somescript-install-" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    try {
        $installerPath = Join-Path $tempDir $assetName
        $sumsPath = Join-Path $tempDir "SHA256SUMS.txt"

        Write-Host "Downloading SHA256SUMS.txt..."
        # Files downloaded via Invoke-WebRequest do not get the Mark-of-the-Web (Zone.Identifier alternate stream),
        # so Windows SmartScreen does not block the unsigned installer.
        Invoke-WebRequest -Uri "$baseUrl/SHA256SUMS.txt" -OutFile $sumsPath -UseBasicParsing

        Write-Host "Downloading $assetName..."
        Invoke-WebRequest -Uri "$baseUrl/$assetName" -OutFile $installerPath -UseBasicParsing

        # Read checksums file and parse expected hash
        $expectedHash = $null
        Get-Content -Path $sumsPath | ForEach-Object {
            $line = $_.Trim()
            if ($line -match '^([a-fA-F0-9]{64})\s+\*?(.+)$') {
                $hash = $matches[1]
                $file = $matches[2].Trim()
                if ($file -eq $assetName) {
                    $expectedHash = $hash
                }
            }
        }

        if (-not $expectedHash) {
            throw "Missing checksum for $assetName in SHA256SUMS.txt."
        }

        # Verify SHA256 checksum (case-insensitive compare)
        $actualHash = (Get-FileHash -Path $installerPath -Algorithm SHA256).Hash
        if ($actualHash.ToLowerInvariant() -ne $expectedHash.ToLowerInvariant()) {
            throw "SHA-256 checksum mismatch for $assetName.`n  Expected: $expectedHash`n  Actual:   $actualHash"
        }

        # Run the installer silently and wait.
        # NSIS installer parameter /D= sets the target directory. It must be the last argument and unquoted.
        $argumentList = @('/S')
        if ($env:SOMESCRIPT_INSTALL_DIR) {
            $argumentList += "/D=$($env:SOMESCRIPT_INSTALL_DIR)"
        }

        Write-Host "Running installer..."
        $process = Start-Process -FilePath $installerPath -ArgumentList $argumentList -Wait -PassThru
        if ($process.ExitCode -ne 0) {
            throw "Installer exited with non-zero exit code: $($process.ExitCode)"
        }

        Write-Host "SomeScript installed successfully."
        if ($env:SOMESCRIPT_INSTALL_DIR) {
            Write-Host "Install location: $($env:SOMESCRIPT_INSTALL_DIR)"
        } else {
            Write-Host "Installed for the current user. Open SomeScript from the Start menu."
        }
    }
    finally {
        if (Test-Path $tempDir) {
            Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Install-SomeScript
