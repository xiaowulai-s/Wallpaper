# Wallpaper

**Adaptive Windows wallpaper that makes your desktop icons part of the scenery.**

Wallpaper turns the space around your icons into a living landscape. Move, add or remove an icon and the beach, meadow, clouds and shadows quietly reshape around it — in real time, without AI, an account or an API key.

This is the **free, open-source Preview**, not a time-limited trial. It includes **all thirteen themes**, the Windows host, settings and sharing tools.

[GitHub](https://github.com/xiaowulai-s/Wallpaper) · [Features](#features) · [Build from source](#build-from-source) · [Download](#windows-installer)

## Included themes

All thirteen themes are complete and freely usable — every parameter is adjustable and saved between sessions:

| Theme | Description |
| --- | --- |
| **Beach** | Turquoise waves, kayaks, seabirds and coconut palms. |
| **Meadow** | Drifting clouds and shadows, a boy flying a kite and a little black cat. |
| **Maldives** | Turquoise water and pale beige sand, with schools of little fish swimming between dark coral reefs. |
| **Lake** | Watercolor grass surrounds a clear lake, with painted stones beneath the shallows and crisp reflections of puffy clouds. |
| **Sky** | A cartoon blue sky where your icons sit on puffy round clouds — day, dusk or night. |
| **Ocean** | Looking down on a blue ocean — your icons hide in white clouds whose shadows fall on the sea. |
| **Forest** | Your icons sit in a clearing ringed by gouache cartoon trees swaying in the breeze. |
| **Pink Forest** | A watercolor forest: translucent pink treetops on fine ink trunks. |
| **Hand-drawn City** | A bird's-eye map of an old town: rows of ink-drawn houses line the streets, and your icons sit in the squares. |
| **Colorful City** | An illustrated city map with red roofs and yellow, pink and blue walls; your icons sit in the squares. |
| **Old Map** | A parchment continent: icons become seas, dotted roads link towns, and horse-drawn wagons carry supplies between them. |
| **Nautical Chart** | A parchment sea chart with coastal ports and lighthouses, winding sea routes, sailing ships and hand-drawn sea monsters. |
| **Lotus Pond** | Lotus leaves and blossoms fill the pond, with koi swimming between the leaves and icons and leaving ripples. |

## Features

- **Adaptive scenery:** uses the real positions of desktop icons and transitions smoothly when they move.
- **Thirteen complete themes:** every setting of every theme is included and saved between sessions.
- **Made for the desktop:** tray controls, startup on sign-in and automatic pause when a window is maximized or full-screen.
- **Private sharing:** image and animation exports use sample icons and color blocks, never a screenshot of your desktop or real file names.
- **Independent installation:** Wallpaper uses its own install directory, settings, startup entry and instance identity, so it can coexist with other wallpaper builds.
- **English and Simplified Chinese:** no sign-in, purchase restoration, update service or store API is included.

## Build from source

Open PowerShell in the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File host\build.ps1
host\bin\Wallpaper.exe
```

Keep `host/` and `prototype/` together. Build output is written to `host/bin/`.

Run the program again or double-click its tray icon to open Settings. To exit and restore the original Windows wallpaper, use the tray menu or run:

```powershell
host\bin\Wallpaper.exe --exit
```

Settings and logs are stored separately in `%LOCALAPPDATA%\Wallpaper`.

## Windows installer

Build the NSIS installer without installing global development tools:

```powershell
powershell -ExecutionPolicy Bypass -File tools\build-installer.ps1
```

The first build downloads portable NSIS and Microsoft's WebView2 bootstrapper. Artifacts are written to `dist/` with SHA256 checksums and a matching source ZIP.

The installer targets the current user's `Programs\Wallpaper` directory and does not require administrator rights. If WebView2 is missing, its bootstrapper requires an internet connection. Uninstalling preserves user settings.

[Download Wallpaper for Windows](https://github.com/xiaowulai-s/Wallpaper/releases/latest). The installer is unsigned, so Windows SmartScreen may show a warning.

## Credits and license

Source code and included theme assets are released under [GPL-3.0](LICENSE). Third-party dependencies are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

This project is published as `Wallpaper`; its name and icon ship with the project and may be used to identify it. It is a renamed fork of the Deskland open-source Preview — trademark rights to the Deskland name, logo and application icon remain with the upstream project. See [TRADEMARKS.md](TRADEMARKS.md).

Issues and suggestions are welcome through GitHub Issues. This is an independent project, so immediate responses are not guaranteed.
