; NSIS Installer Script for Delkam Desktop (Electron)
; Ensures clean upgrade and eliminates duplicate shortcuts or older versions

!macro customInstall
  DetailPrint "Cleaning up previous and duplicate desktop shortcuts..."
  Delete "$DESKTOP\سامانه مدیریت انبار.lnk"
  Delete "$DESKTOP\Dlkam.lnk"
  Delete "$SMPROGRAMS\سامانه مدیریت انبار.lnk"
  Delete "$SMPROGRAMS\Dlkam.lnk"
!macroend

!macro customUnInstall
  Delete "$DESKTOP\سامانه مدیریت انبار.lnk"
  Delete "$DESKTOP\Dlkam.lnk"
  Delete "$DESKTOP\سامانه دلکام.lnk"
  Delete "$SMPROGRAMS\سامانه مدیریت انبار.lnk"
  Delete "$SMPROGRAMS\سامانه دلکام.lnk"
!macroend
