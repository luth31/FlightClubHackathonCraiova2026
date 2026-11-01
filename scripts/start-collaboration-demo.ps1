param([string]$PythonPath)
$ErrorActionPreference='Stop'
$collabRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$collabRuntime=Join-Path $collabRoot '.runtime\collaboration-demo'
if(-not $PythonPath){
    $candidates=@((Join-Path $collabRoot 'backend\.venv\Scripts\python.exe'),(Join-Path $collabRoot '..\field-actions\backend\.venv\Scripts\python.exe'))
    $PythonPath=$candidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
}
if(-not $PythonPath){throw 'Provide -PythonPath pointing to a virtual environment with backend requirements installed.'}
$PythonPath=(Resolve-Path $PythonPath).Path
$nodePath=(Get-Command node -ErrorAction Stop).Source
$vitePath=Join-Path $collabRoot 'frontend\node_modules\vite\bin\vite.js'
if(-not (Test-Path -LiteralPath $vitePath)){throw 'Run npm ci in frontend first.'}
$processFile=Join-Path $collabRuntime 'processes.json'
if(Test-Path -LiteralPath $processFile){
    $recorded=Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
    $live=$recorded | Where-Object {Get-Process -Id $_.pid -ErrorAction SilentlyContinue}
    if($live){throw 'The demo has running processes. Run scripts/stop-collaboration-demo.ps1 before restarting it.'}
}
foreach($port in @(8014,8015,8016,8017,5184,5185,5186,5187,8030)){
    $probe=[System.Net.Sockets.TcpClient]::new()
    try{if($probe.ConnectAsync('127.0.0.1',$port).Wait(150) -and $probe.Connected){throw "Port $port is occupied. Stop its owning app first."}}
    catch [System.AggregateException] {} finally{$probe.Dispose()}
}
& $PythonPath (Join-Path $PSScriptRoot 'collaboration_demo.py') prepare
if($LASTEXITCODE -ne 0){throw 'Could not prepare the demo.'}
$nodes=Get-Content -LiteralPath (Join-Path $collabRuntime 'network.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach($airport in $nodes){
    & $PythonPath (Join-Path $PSScriptRoot 'collaboration_demo.py') seed $airport.id
    if($LASTEXITCODE -ne 0){throw "Could not initialize $($airport.id)."}
}
$started=@()
function Start-DemoProcess($name,$executable,$arguments,$directory){
    $process=Start-Process -FilePath $executable -ArgumentList $arguments -WorkingDirectory $directory -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $collabRuntime "$name.stdout.log") -RedirectStandardError (Join-Path $collabRuntime "$name.stderr.log")
    return @{name=$name;pid=$process.Id;executable=$executable;arguments=($arguments -join ' ')}
}
try{
    $started+=Start-DemoProcess 'relay' $PythonPath @((Join-Path $PSScriptRoot 'collaboration_demo.py'),'gateway') $collabRoot
    $started | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $processFile -Encoding UTF8
    foreach($airport in $nodes){
        foreach($property in $airport.env.PSObject.Properties){[Environment]::SetEnvironmentVariable($property.Name,[string]$property.Value,'Process')}
        $started+=Start-DemoProcess "$($airport.id)-api" $PythonPath @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port',[string]$airport.api_port) (Join-Path $collabRoot 'backend')
        $started+=Start-DemoProcess "$($airport.id)-web" $nodePath @($vitePath,'--host','127.0.0.1','--port',[string]$airport.web_port,'--strictPort','--configLoader','native') (Join-Path $collabRoot 'frontend')
        $started | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $processFile -Encoding UTF8
    }
    & $PythonPath (Join-Path $PSScriptRoot 'collaboration_demo.py') bootstrap
    if($LASTEXITCODE -ne 0){throw 'Demo processes started, but conversation initialization failed. Inspect the logs before retrying bootstrap.'}
    foreach($airport in $nodes){
        $ready=$false
        for($attempt=0;$attempt -lt 30;$attempt++){
            try{$response=Invoke-WebRequest -Uri "$($airport.url)/api/health" -UseBasicParsing -TimeoutSec 2;if($response.StatusCode -eq 200){$ready=$true;break}}catch{}
            Start-Sleep -Milliseconds 250
        }
        if(-not $ready){throw "The web app for $($airport.id) did not start. Inspect its web stderr log."}
    }
    $nodes | Select-Object name,url
}catch{
    Write-Warning 'Only demo-owned processes are recorded in .runtime/collaboration-demo/processes.json. Use the stop script if needed.'
    throw
}
