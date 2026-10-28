$WshShell = New-Object -ComObject WScript.Shell

$desktop = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)

# Raccourci pour Démarrer (avec icône officielle OCP)
$ShortcutStart1 = $WshShell.CreateShortcut("$desktop\OCP Pointage.lnk")
$ShortcutStart1.TargetPath = "C:\ocpdahsboard\demarrer.bat"
$ShortcutStart1.WorkingDirectory = "C:\ocpdahsboard"
$ShortcutStart1.IconLocation = "C:\ocpdahsboard\public\assets\favicon.ico,0"
$ShortcutStart1.Description = "Lancer OCP Pointage (Application et Serveur)"
$ShortcutStart1.Save()

# Mise à jour de l'ancien raccourci s'il existe
$ShortcutStart2 = $WshShell.CreateShortcut("$desktop\OCP-pointage.lnk")
$ShortcutStart2.TargetPath = "C:\ocpdahsboard\demarrer.bat"
$ShortcutStart2.WorkingDirectory = "C:\ocpdahsboard"
$ShortcutStart2.IconLocation = "C:\ocpdahsboard\public\assets\favicon.ico,0"
$ShortcutStart2.Description = "Lancer OCP Pointage (Application et Serveur)"
$ShortcutStart2.Save()

# Raccourci pour Arrêter
$ShortcutStop = $WshShell.CreateShortcut("$desktop\Arreter OCP Pointage.lnk")
$ShortcutStop.TargetPath = "C:\ocpdahsboard\arreter.bat"
$ShortcutStop.WorkingDirectory = "C:\ocpdahsboard"
$ShortcutStop.Description = "Arrêter le serveur OCP Pointage"
$ShortcutStop.Save()

# Nettoyage de l'éventuel raccourci avec accent mal encodé
if (Test-Path "$desktop\Arrêter OCP Pointage.lnk") {
    Remove-Item "$desktop\Arrêter OCP Pointage.lnk" -Force -ErrorAction SilentlyContinue
}

Write-Host "Raccourcis configures sur le Bureau :"
Write-Host "-> $desktop\OCP Pointage.lnk"
Write-Host "-> $desktop\Arreter OCP Pointage.lnk"
