$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class ActivityNative {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder text, int max);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint flags; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT rect);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr h, ref MONITORINFO info);
  public static double IdleSeconds() { var i=new LASTINPUTINFO(); i.cbSize=(uint)Marshal.SizeOf(i); GetLastInputInfo(ref i); return unchecked((uint)Environment.TickCount-i.dwTime)/1000.0; }
  public static bool Fullscreen(IntPtr h) { RECT r; var m=new MONITORINFO(); m.cbSize=Marshal.SizeOf(m); return GetWindowRect(h,out r) && GetMonitorInfo(MonitorFromWindow(h,2),ref m) && r.Left<=m.rcMonitor.Left && r.Top<=m.rcMonitor.Top && r.Right>=m.rcMonitor.Right && r.Bottom>=m.rcMonitor.Bottom; }
}
'@
$previousSample = [DateTime]::UtcNow
while ($true) {
  $foregroundHandle = [ActivityNative]::GetForegroundWindow()
  $windowText = New-Object System.Text.StringBuilder 1001
  [void][ActivityNative]::GetWindowText($foregroundHandle, $windowText, 1001)
  [uint32]$foregroundProcessId = 0
  [void][ActivityNative]::GetWindowThreadProcessId($foregroundHandle, [ref]$foregroundProcessId)
  $foregroundProcess = Get-Process -Id $foregroundProcessId -ErrorAction SilentlyContinue
  $sampleTime = [DateTime]::UtcNow
  $idleSeconds = [ActivityNative]::IdleSeconds()
  $applicationName = if ($foregroundProcess) { $foregroundProcess.ProcessName } else { 'Unknown' }
  $sample = @{
    id=[guid]::NewGuid().ToString(); timestamp=$sampleTime.ToString('yyyy-MM-ddTHH:mm:ss.fffZ');
    durationMs=[Math]::Min(60000,[int]($sampleTime-$previousSample).TotalMilliseconds);
    source='windows-desktop'; type='foreground_window'; application=$applicationName;
    title=$windowText.ToString(); idle=($idleSeconds -ge 120);
    metadata=@{idleSeconds=$idleSeconds; fullscreen=[ActivityNative]::Fullscreen($foregroundHandle)}
  }
  $sample | ConvertTo-Json -Compress
  $previousSample = $sampleTime
  Start-Sleep -Seconds 15
}
