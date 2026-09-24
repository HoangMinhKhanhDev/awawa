$B = $env:API_BASE
$T = $env:API_TOKEN
if ([string]::IsNullOrWhiteSpace($B) -or [string]::IsNullOrWhiteSpace($T)) { throw 'Set API_BASE and API_TOKEN before running this smoke test.' }
function Call($method, $url, $body, $headers) {
  $f = "$env:TEMP\m2.json"
  if ($body) { [System.IO.File]::WriteAllText($f, $body) } else { $f = $null }
  $a = @('-s', '-w', "`n%{http_code}", '-X', $method, $url)
  foreach ($h in $headers) { $a += @('-H', $h) }
  if ($f) { $a += @('-H', 'Content-Type: application/json', '--data-binary', "@$f") }
  & curl.exe @a
  Write-Output ''
}
function J($txt) { ($txt | Select-Object -First 1 | ConvertFrom-Json) }
$HT = @("X-Api-Token: $T")
Write-Output '--- login GV/HS ---'
$lg = @('{"login":"0900000001","password":"Gv@123456"}', '{"login":"0911111111","password":"Hs@123456"}')
[System.IO.File]::WriteAllText("$env:TEMP\l1.json", $lg[0])
[System.IO.File]::WriteAllText("$env:TEMP\l2.json", $lg[1])
$gv = J (Call POST "$B/api/auth/login" (Get-Content "$env:TEMP\l1.json" -Raw) @())
$hs = J (Call POST "$B/api/auth/login" (Get-Content "$env:TEMP\l2.json" -Raw) @())
$SHT = @("X-Api-Token: $T", "X-Session-Token: $($gv.token)")
$SHS = @("X-Api-Token: $T", "X-Session-Token: $($hs.token)")
Write-Output "gv id=$($gv.student.id), hs id=$($hs.student.id)"

Write-Output '--- 1. /classes GV: list teams (alias) ---'
Call GET "$B/api/classes" $null $SHT

Write-Output '--- 2. HS join bang ma HSG2026 ---'
$jr = J (Call POST "$B/api/classes/join" '{"join_code":"HSG2026"}' $SHS)
Write-Output "joined team: $(($jr | ConvertTo-Json -Compress).Substring(0,120))"

Write-Output '--- 3. GV tao assignment (class_id=1 = team 1) ---'
$asBody = '{"class_id":1,"title":"M2 Bai tap team","deadline":"2026-10-01","questions":[{"content":"Q1","points":2},{"content":"Q2","points":3}]}'
$as = J (Call POST "$B/api/assignments" $asBody $SHT)
$aid = $as.id
Write-Output "assignment id=$aid n=$($as.questions)"

Write-Output '--- 4. HS list assignments (qua team) ---'
Call GET "$B/api/assignments" $null $SHS

Write-Output '--- 5. HS submit ---'
Call POST "$B/api/assignments/$aid/submit" '{"answers":[{"idx":1,"text":"A1"},{"idx":2,"text":"A2"}]}' $SHS

Write-Output '--- 6. GV xem submissions list ---'
$sub = Call GET "$B/api/assignments/$aid/submissions" $null $SHT
Write-Output $sub.Substring(0, [Math]::Min(400, $sub.Length))

Write-Output '--- 7. me/progress HS ---'
Call GET "$B/api/me/progress" $null $SHS

Write-Output '--- 8. cleanup: remove assignment (khong co endpoint delete assignments — de lai) + khong xoa HS demo ---'
Write-Output "DONE aid=$aid"
