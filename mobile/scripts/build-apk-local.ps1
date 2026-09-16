$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidSdk = 'C:\Users\User\AppData\Local\Android\Sdk'
$javaHome = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot'

if (-not (Test-Path $androidSdk)) {
  throw "Android SDK nao encontrado em: $androidSdk"
}

if (-not (Test-Path $javaHome)) {
  throw "Java JDK nao encontrado em: $javaHome"
}

$env:CI = '1'
$env:NODE_ENV = 'production'
$env:ANDROID_HOME = $androidSdk
$env:ANDROID_SDK_ROOT = $androidSdk
$env:JAVA_HOME = $javaHome
$env:Path = "$javaHome\bin;$androidSdk\platform-tools;$androidSdk\cmdline-tools\latest\bin;$env:Path"

Write-Host '==> Gerando projeto nativo Android (prebuild)...'
Push-Location $projectRoot
npx.cmd expo prebuild --platform android
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'Falha ao preparar o projeto Android.' }
Pop-Location

Write-Host '==> Compilando APK release local...'
Push-Location (Join-Path $projectRoot 'android')
.\gradlew.bat assembleRelease
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'Falha na compilacao Android.' }
Pop-Location

$apkPath = Join-Path $projectRoot 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $apkPath)) {
  throw "APK nao encontrado em: $apkPath"
}

Write-Host "APK gerado com sucesso: $apkPath"
