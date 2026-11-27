param(
  [string]$Message = "",
  [switch]$RunTests
)

$ErrorActionPreference = "Stop"

# Ensure Node.js, MinGit, and GitHub CLI are in PATH
$extraPaths = @(
  "$env:LOCALAPPDATA\Programs\nodejs",
  "$env:LOCALAPPDATA\Programs\Git\cmd",
  "C:\Program Files\Git\cmd",
  "C:\Program Files\GitHub CLI"
)
foreach ($p in $extraPaths) {
  if ((Test-Path $p) -and ($env:Path -notlike "*$p*")) {
    $env:Path = "$p;$env:Path"
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " KBO GM 2027 - GitHub Auto-Update Check " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. TypeScript Lint Check (abort on failure)
Write-Host "`n[1/5] TypeScript Lint (npm run lint)..." -ForegroundColor Yellow
npm.cmd run lint
if ($LASTEXITCODE -ne 0) {
  Write-Error "Lint 실패! 자동 업로드를 중단합니다. 오류를 먼저 수정하세요."
  exit $LASTEXITCODE
}

# 2. Optional Test Suite
if ($RunTests) {
  Write-Host "`n[2/5] Running Tests (npm test)..." -ForegroundColor Yellow
  npm.cmd test
  if ($LASTEXITCODE -ne 0) {
    Write-Error "테스트 실패! 자동 업로드를 중단합니다."
    exit $LASTEXITCODE
  }
} else {
  Write-Host "`n[2/5] Skipping full test suite (pass -RunTests to include)..." -ForegroundColor DarkGray
}

# 3. Production Build Check (abort on failure)
Write-Host "`n[3/5] Production Build (npm run build)..." -ForegroundColor Yellow
npm.cmd run build
if ($LASTEXITCODE -ne 0) {
  Write-Error "빌드 실패! 자동 업로드를 중단합니다. 빌드 오류를 먼저 수정하세요."
  exit $LASTEXITCODE
}

# 4. Verify Git repository, branch & changed files (never reset/wipe repo)
Write-Host "`n[4/5] Checking Git repository & staging changed files..." -ForegroundColor Yellow
if (-not (Test-Path ".git")) {
  Write-Error ".git 저장소가 초기화되어 있지 않습니다. 원격 저장소를 먼저 연결하세요."
  exit 1
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$remoteUrl = (git remote get-url origin).Trim()
Write-Host "  Branch : $branch"
Write-Host "  Remote : $remoteUrl"

$status = git status --porcelain
if (-not $status) {
  Write-Host "  변경된 파일이 없습니다. 커밋을 건너뛰고 원격 동기화만 확인합니다." -ForegroundColor Green
} else {
  git add -A
  if (-not $Message -or $Message.Trim().Length -eq 0) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm"
    $Message = "chore: auto-update KBO GM 2027 ($ts)"
  }
  # Ensure local git author identity exists without modifying global config if already set
  $userName = git config user.name 2>$null
  $userEmail = git config user.email 2>$null
  if (-not $userName) { git config user.name "GM2027" }
  if (-not $userEmail) { git config user.email "gm2027@users.noreply.github.com" }

  git commit -m $Message
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Git 커밋 중 오류가 발생했습니다."
    exit $LASTEXITCODE
  }
}

# 5. Push to GitHub (triggers GitHub Pages workflow automatically)
Write-Host "`n[5/5] Pushing to GitHub ($remoteUrl -> $branch)..." -ForegroundColor Yellow
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$env:GIT_TERMINAL_PROMPT = "0"
if (Get-Command gh -ErrorAction SilentlyContinue) {
  $null = & gh auth status 2>&1
  if ($LASTEXITCODE -eq 0) {
    $null = & gh auth setup-git 2>&1
  }
}

& git push origin $branch
$pushExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap

if ($pushExit -ne 0) {
  Write-Warning "로컬 빌드 검증 및 커밋은 완료되었으나, GitHub 인증이 아직 연결되지 않아 푸시가 보류되었습니다."
  Write-Host "최초 1회 'gh auth login -h github.com -p https -w' 로 로그인한 뒤 'npm run deploy:github' 을 실행하면 이후 영구 자동 푸시됩니다." -ForegroundColor Yellow
  exit 2
}

Write-Host "`n[SUCCESS] GitHub 업데이트 및 GitHub Pages 자동 배포 트리거 완료!" -ForegroundColor Green
exit 0
