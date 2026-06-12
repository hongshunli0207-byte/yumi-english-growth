$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$node = "C:\Users\LEE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$script = Join-Path $repo "scripts\sync-library.js"
$taskName = "Yumi Library Sync Every 5 Days"

if (!(Test-Path $node)) {
  throw "Node runtime not found: $node"
}

if (!(Test-Path $script)) {
  throw "Sync script not found: $script"
}

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$script`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -DaysInterval 5 -At 9:00am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Scan Yumi local reading library and sync book metadata." -Force

Write-Host "Installed task: $taskName"
Write-Host "Runs every 5 days at 09:00 and starts when available if missed."
