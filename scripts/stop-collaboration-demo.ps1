$ErrorActionPreference='Stop'
$collabRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$file=Join-Path $collabRoot '.runtime\collaboration-demo\processes.json'
if(-not(Test-Path -LiteralPath $file)){Write-Output 'No recorded demo processes.';exit}
$recorded=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
$processes=Get-CimInstance Win32_Process
foreach($entry in $recorded){
    $running=$processes | Where-Object {$_.ProcessId -eq $entry.pid}
    if(-not $running){continue}
    if(-not $running.CommandLine -or -not $running.CommandLine.Contains($entry.arguments)){
        throw "Process $($entry.pid) no longer matches the recorded demo command; leaving it running."
    }
    $children=$processes | Where-Object {$_.ParentProcessId -eq $entry.pid -and $_.CommandLine -and $_.CommandLine.Contains($entry.arguments)}
    foreach($child in $children){
        try{Stop-Process -Id $child.ProcessId -Force -ErrorAction Stop}catch{if($_.FullyQualifiedErrorId -notlike 'NoProcessFoundForGivenId*'){throw}}
        Wait-Process -Id $child.ProcessId -Timeout 10 -ErrorAction SilentlyContinue
    }
    try{Stop-Process -Id $entry.pid -Force -ErrorAction Stop}catch{if($_.FullyQualifiedErrorId -notlike 'NoProcessFoundForGivenId*'){throw}}
    Wait-Process -Id $entry.pid -Timeout 10 -ErrorAction SilentlyContinue
}
Write-Output 'Demo processes stopped. All airport data and configuration were preserved.'
