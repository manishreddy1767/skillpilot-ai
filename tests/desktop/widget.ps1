# Real-input test of the floating widget. Launches the built app, moves the real
# mouse, and reads window state from Windows itself, so the app needs no test hooks.
# A temporary form stands in for "another app" behind the widget.
# Takes over the mouse for about 30 seconds. Run `npm run build:test` first.
# It uses the test build and test data folder, so a saved widget position is safe.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class W {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static IntPtr Find(string title, uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, p) => {
      uint owner; GetWindowThreadProcessId(h, out owner);
      if (owner != pid) return true;
      var s = new StringBuilder(256); GetWindowText(h, s, 256);
      if (s.ToString() == title) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@

$root = Resolve-Path (Join-Path $PSScriptRoot '../..')
# Matches DEFAULT_WIDGET_SIZE in src/shared/settings.ts.
$size = 64
$half = $size / 2
$electron = Join-Path $root 'node_modules/electron/dist/electron.exe'
$harness = Join-Path $root 'tests/integration/harness.cjs'
$positionFile = Join-Path $env:TEMP 'skillpilot-ai-test/widget-position.json'
Remove-Item $positionFile -ErrorAction SilentlyContinue
$script:failures = 0
$script:app = $null

function Wait($ms) {
  $end = [DateTime]::UtcNow.AddMilliseconds($ms)
  while ([DateTime]::UtcNow -lt $end) {
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 10
  }
}

function Check($name, [bool]$ok, $detail = '') {
  if ($ok) { Write-Output "PASS  $name $detail" }
  else { Write-Output "FAIL  $name $detail"; $script:failures++ }
}

function Rect($hwnd) {
  $r = New-Object W+RECT
  [void][W]::GetWindowRect($hwnd, [ref]$r)
  [pscustomobject]@{ X = $r.L; Y = $r.T; W = $r.R - $r.L; H = $r.B - $r.T }
}

function Glide($x, $y, $steps = 12) {
  $from = [System.Windows.Forms.Cursor]::Position
  for ($i = 1; $i -le $steps; $i++) {
    [void][W]::SetCursorPos(
      [int]($from.X + ($x - $from.X) * $i / $steps),
      [int]($from.Y + ($y - $from.Y) * $i / $steps))
    Wait 12
  }
}

function Press { [W]::mouse_event(2, 0, 0, 0, [IntPtr]::Zero); Wait 40 }
function Release { [W]::mouse_event(4, 0, 0, 0, [IntPtr]::Zero); Wait 40 }
function Click($x, $y) { Glide $x $y 4; Wait 60; Press; Release }

function Start-App([string[]]$extra = @()) {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  $script:app = Start-Process -FilePath $electron -ArgumentList (@($harness) + $extra) -WorkingDirectory $root -PassThru
  $pid32 = [uint32]$script:app.Id
  for ($i = 0; $i -lt 100; $i++) {
    Wait 100
    $w = [W]::Find('SkillPilot Widget', $pid32)
    # A cold launch responds slowly at first, so give it time to warm up before acting.
    if ($w -ne [IntPtr]::Zero -and [W]::IsWindowVisible($w)) { Wait 3000; return $w }
  }
  throw 'Widget window did not appear'
}

function Stop-App {
  if ($script:app) {
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$($script:app.Id)" |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Stop-Process -Id $script:app.Id -Force -ErrorAction SilentlyContinue
    $script:app = $null
    Wait 500
  }
}

function PanelOpen { $o = [W]::Find('SkillPilot Overview', [uint32]$script:app.Id); $o -ne [IntPtr]::Zero -and [W]::IsWindowVisible($o) }
function AppOpen { $a = [W]::Find('SkillPilot AI', [uint32]$script:app.Id); $a -ne [IntPtr]::Zero -and [W]::IsWindowVisible($a) }

$saved = [System.Windows.Forms.Cursor]::Position
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Widget test: other app'
$form.StartPosition = 'Manual'
$form.Bounds = New-Object System.Drawing.Rectangle(250, 120, 700, 520)
$script:clicks = 0
$form.Add_MouseDown({ $script:clicks++ })
$box = New-Object System.Windows.Forms.TextBox
$box.Bounds = New-Object System.Drawing.Rectangle(20, 20, 300, 24)
$form.Controls.Add($box)
$form.Show()
# Windows can stop a background script raising a window. Briefly going topmost always works,
# and it must work: otherwise this test's clicks and typing would land in another app.
$form.TopMost = $true
$form.TopMost = $false

try {
  $widget = Start-App
  $start = Rect $widget
  Check 'widget appears at its fixed size' ($start.W -eq $size -and $start.H -eq $size) "$($start.W)x$($start.H)"

  # Put the widget over the other app, then give that app the focus.
  $cx = $start.X + $half; $cy = $start.Y + $half
  Glide $cx $cy; Wait 60; Press; Glide 600 380 20; Wait 80; Release; Glide 300 600; Wait 700
  $r = Rect $widget
  Check 'drag moves the widget with the cursor' ($r.X -eq (600 - $half) -and $r.Y -eq (380 - $half)) "at $($r.X),$($r.Y)"
  Check 'a drag does not open the app' (-not (AppOpen))

  $form.TopMost = $true; $form.TopMost = $false; Wait 100
  Click 300 600; Wait 150
  $other = [W]::GetForegroundWindow()
  Check 'other app has focus' ($other -eq $form.Handle)
  if ($other -ne $form.Handle) { throw 'The test window is not in front, so stopping before clicking or typing elsewhere' }

  # Round shape: the corner of the square should belong to the app behind.
  $before = $script:clicks
  Click ($r.X + 2) ($r.Y + 2); Wait 150
  Check 'clicks pass through the corners of the widget' ($script:clicks -eq $before + 1)
  Glide 300 600; Wait 500

  # Passing over quickly should not open the panel.
  Glide ($r.X + $half) ($r.Y + $half) 3; Glide 300 600 3; Wait 400
  Check 'passing over does not open the panel' (-not (PanelOpen))

  # Resting opens it, without taking focus.
  Glide ($r.X + $half) ($r.Y + $half); Wait 450
  Check 'resting on the widget opens the panel' (PanelOpen)
  Check 'hover leaves focus on the other app' ([W]::GetForegroundWindow() -eq $other)

  $o = Rect ([W]::Find('SkillPilot Overview', [uint32]$script:app.Id))
  Check 'panel opens beside the widget' ($o.X -eq $r.X + $size + 8) "panel at $($o.X),$($o.Y)"

  # Crossing into the panel keeps it open, and leaving closes it.
  Glide ($o.X + 150) ($r.Y + $half) 10; Wait 800
  Check 'moving into the panel keeps it open' (PanelOpen)
  Glide 300 600; Wait 700
  Check 'leaving closes the panel' (-not (PanelOpen))
  Check 'widget stays put through hover' ((Rect $widget).X -eq $r.X)

  # Unrestricted placement: middle of the screen, then partly off the edge.
  Glide ($r.X + $half) ($r.Y + $half); Wait 40; Press; Glide 768 432 20; Wait 80; Release; Glide 300 600; Wait 500
  $m = Rect $widget
  Check 'widget can sit in the middle of the screen' ($m.X -eq (768 - $half) -and $m.Y -eq (432 - $half)) "at $($m.X),$($m.Y)"
  Check 'panel stayed closed during the drag' (-not (PanelOpen))

  Glide ($m.X + $half) ($m.Y + $half); Wait 40; Press; Glide 2 2 24; Wait 80; Release; Glide 300 600; Wait 500
  $e = Rect $widget
  Check 'widget is not clamped at the screen edge' ($e.X -eq (2 - $half) -and $e.Y -eq (2 - $half)) "at $($e.X),$($e.Y)"

  Glide 20 20; Wait 40; Press; Glide 600 380 20; Wait 80; Release; Glide 300 600; Wait 500
  $r = Rect $widget
  Check 'widget can be dragged back' ($r.X -gt 500 -and $r.Y -gt 300) "at $($r.X),$($r.Y)"
  Check 'dragging never changes the widget size' ($r.W -eq $size -and $r.H -eq $size) "$($r.W)x$($r.H)"

  # Typing in another app is not disturbed by hovering or dragging the widget.
  function TypeSafely($text) {
    if ([W]::GetForegroundWindow() -ne $form.Handle) { throw 'Focus left the test window, so stopping before typing elsewhere' }
    [System.Windows.Forms.SendKeys]::SendWait($text); Wait 150
  }
  $box.Focus() | Out-Null; Wait 100
  TypeSafely 'abc'
  Glide ($r.X + $half) ($r.Y + $half); Wait 500
  TypeSafely 'def'
  Glide 300 600; Wait 600
  Glide ($r.X + $half) ($r.Y + $half); Wait 40; Press; Glide 700 420 12; Wait 60; Release
  TypeSafely 'ghi'
  Check 'typing elsewhere survives hovering and dragging' ($box.Text -eq 'abcdefghi') "typed '$($box.Text)'"

  # The global shortcuts work from another app, and do not type into it.
  TypeSafely '^%+s'; Wait 500
  Check 'Ctrl+Alt+Shift+S hides the widget' (-not [W]::IsWindowVisible($widget))
  TypeSafely '^%+s'; Wait 500
  Check 'Ctrl+Alt+Shift+S shows it again' ([W]::IsWindowVisible($widget))
  Check 'shortcuts do not type into the other app' ($box.Text -eq 'abcdefghi') "text '$($box.Text)'"
  Glide 300 600; Wait 500
  $r = Rect $widget

  # Free placement at every corner and edge, with the panel staying on screen.
  $work = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $spots = @(
    @(40, 40), @(($work.Right - 40), 40), @(40, ($work.Bottom - 40)), @(($work.Right - 40), ($work.Bottom - 40)),
    @([int]($work.Right / 2), 40), @([int]($work.Right / 2), ($work.Bottom - 40)), @(40, [int]($work.Bottom / 2)), @(($work.Right - 40), [int]($work.Bottom / 2))
  )
  foreach ($spot in $spots) {
    $from = Rect $widget
    Glide ($from.X + $half) ($from.Y + $half); Wait 40; Press; Glide $spot[0] $spot[1] 14; Wait 60; Release
    Glide 300 300 6; Wait 450
    $now = Rect $widget
    $placed = ($now.X -eq ($spot[0] - $half)) -and ($now.Y -eq ($spot[1] - $half))
    Glide ($now.X + $half) ($now.Y + $half); Wait 500
    $open = PanelOpen
    $p = Rect ([W]::Find('SkillPilot Overview', [uint32]$script:app.Id))
    $onScreen = ($p.X -ge $work.X) -and ($p.Y -ge $work.Y) -and (($p.X + $p.W) -le $work.Right) -and (($p.Y + $p.H) -le $work.Bottom)
    Check "placement at $($spot[0]),$($spot[1])" ($placed -and $open -and $onScreen) "widget $($now.X),$($now.Y) panel $($p.X),$($p.Y) $($p.W)x$($p.H)"
    Glide 300 300 6; Wait 600
  }
  $from = Rect $widget
  Glide ($from.X + $half) ($from.Y + $half); Wait 40; Press; Glide 600 380 14; Wait 60; Release
  Glide 300 600; Wait 500
  $r = Rect $widget

  # Click expands to the full app, which takes focus as a normal window should.
  Click ($r.X + $half) ($r.Y + $half); Wait 1500
  Check 'click opens the full app' (AppOpen)
  $appHwnd = [W]::Find('SkillPilot AI', [uint32]$script:app.Id)
  Check 'full app takes focus' ([W]::GetForegroundWindow() -eq $appHwnd)
  Check 'widget did not move on click' ((Rect $widget).X -eq $r.X)

  $a = Rect $appHwnd
  Click ($a.X + $a.W - 210) ($a.Y + 20); Wait 500
  Check 'minimize returns to the widget' (-not (AppOpen))
  Check 'widget is still visible' ([W]::IsWindowVisible($widget))

  # Clicking again re-opens the same window.
  $r = Rect $widget
  Click ($r.X + $half) ($r.Y + $half); Wait 700
  Check 'widget re-opens the app' (AppOpen)
  $a = Rect $appHwnd
  Click ($a.X + $a.W - 210) ($a.Y + 20); Wait 400
  Stop-App

  # Reopening returns to the dragged spot, even after a forced stop.
  $widget = Start-App
  $reopened = Rect $widget
  Check 'widget reopens where it was left' ($reopened.X -eq $r.X -and $reopened.Y -eq $r.Y) "at $($reopened.X),$($reopened.Y)"
  Stop-App

  # Click-through mode: clicks reach the app behind.
  $widget = Start-App @('--click-through')
  $s = Rect $widget
  $form.Bounds = New-Object System.Drawing.Rectangle(($s.X - 200), ($s.Y - 200), 320, 320)
  Wait 300
  Click ($s.X - 100) ($s.Y - 100); Wait 150
  $before = $script:clicks
  Click ($s.X + $half) ($s.Y + $half); Wait 500
  Check 'click-through passes clicks to the app behind' ($script:clicks -eq $before + 1)
  Check 'click-through does not open the panel' (-not (PanelOpen))
  Check 'click-through does not open the app' (-not (AppOpen))
  Stop-App
}
catch {
  Check 'test run completed' $false $_.Exception.Message
}
finally {
  Stop-App
  $form.Close()
  [void][W]::SetCursorPos($saved.X, $saved.Y)
}

Write-Output "Failures: $($script:failures)"
exit $script:failures
