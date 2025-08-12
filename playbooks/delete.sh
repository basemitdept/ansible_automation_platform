$folderPath = "$env:C:\ubuntu"
$cutoffDate = (Get-Date).AddDays(-24).Date  # .Date sets time to 12:00 AM

Get-ChildItem -Path $folderPath -File | 
Where-Object { $_.LastWriteTime -lt $cutoffDate }|
Remove-Item -Force -Verbose