$WshShell = New-Object -ComObject WScript.Shell

$desktop = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)

# Raccourci pour Démarrer
$ShortcutStart = $WshShell.CreateShortcut("$desktop\OCP Pointage.lnk")
$ShortcutStart.TargetPath = "C:\ocpdahsboard\demarrer.bat"
$ShortcutStart.WorkingDirectory = "C:\ocpdahsboard"
$ShortcutStart.IconLocation = "C:\ocpdahsboard\public\assets\favicon.ico,0"
$ShortcutStart.Description = "Lancer OCP Pointage (Application et Serveur)"
$ShortcutStart.Save()

# Raccourci pour Arrêter
$ShortcutStop = $WshShell.CreateShortcut("$desktop\Arrêter OCP Pointage.lnk")
$ShortcutStop.TargetPath = "C:\ocpdahsboard\arreter.bat"
$ShortcutStop.WorkingDirectory = "C:\ocpdahsboard"
$ShortcutStop.Description = "Arrêter le serveur OCP Pointage"
$ShortcutStop.Save()

Write-Host "Raccourcis créés avec succès sur le Bureau :"
Write-Host "1. $desktop\OCP Pointage.lnk"
Write-Host "2. $desktop\Arrêter OCP Pointage.lnk"
