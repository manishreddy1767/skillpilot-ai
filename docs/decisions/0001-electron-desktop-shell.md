# ADR 0001: Electron as the desktop shell

- Status: Proposed
- Date: 2026-11-06

## Context

The floating widget is the defining requirement. It needs transparent frameless windows,
always-on-top behaviour, free positioning across monitors, reliable hover, and no focus stealing. The
target is one Windows 11 laptop, which has Node 24 and .NET 10 installed. Rust is not installed.

## Options

| | Electron | Tauri 2 | WPF on .NET 10 |
|---|---|---|---|
| Transparent, frameless, on top | Yes | Yes, with reported frameless issues on Windows | Yes, the most native |
| Click-through with hover forwarding | Documented API | Would need custom native work | Available through Win32 calls |
| Rendering | Bundled Chromium, identical everywhere | System WebView2 | Native |
| Dashboards and charts | Large React ecosystem | Same UI ecosystem | Slower to build, fewer modern options |
| Memory use | Highest | Low | Lowest |
| Installer size | Largest, around 100 MB or more | Smallest | Small |
| New setup on this laptop | None | Rust and MSVC build tools | None |

## Decision

Use Electron.

The widget depends on exact mouse and window behaviour, and Electron documents the APIs that matter
most here, including `setIgnoreMouseEvents` with `forward`. It needs no new toolchain, and the React
ecosystem makes the dashboard much faster to build.

WPF is the serious alternative. It would use far less memory, but the large interface would take
considerably longer to build. Tauri's saving is real, but it adds Rust and has more reported
frameless-window problems on Windows, which is the riskiest area of this project.

## Consequences

- Memory use will be higher than a native app. Expect a few hundred MB with the full app open. This
  is an estimate, to be measured in milestone 6. The main window is created only when first opened.
- The installer is large. That does not matter for one laptop.
- If the widget spike in milestone 0 fails on a core behaviour, this decision is revisited before any
  further work.
