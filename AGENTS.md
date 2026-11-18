# Wallpaper 开源版开发指南

- 用中文与项目负责人沟通。
- 本仓库包含基础宿主、共用界面与框架和全部 13 个免费主题；每个主题都有页面、参数与实现代码。
- 界面只保留简体中文和英文，不跟随主程序增加其他语言。
- 不提供账号登录、购买恢复或自动检查更新功能，不接入授权服务、官网更新清单或商店更新接口。
- 保持 `themes.json`、主题参数默认值和中英文文案一致；所有主题均为 `ready + free`，可切换当前壁纸。
- 修改主题后检查图标移动、预览、暂停和分享；所有画布按实际像素与小数显示尺寸绘制。
- 壁纸常驻后台，以核显 30fps 为目标。静态绘图进入缓存，小物体使用局部图层，不在全屏着色器中逐个计算大量物体。
- `prototype/thumbs/` 是人工设计的缩略图，未经要求不要重新生成或覆盖。
- 主程序：`powershell -ExecutionPolicy Bypass -File host\build.ps1`；产物 `host/bin/Wallpaper.exe`。
- 浏览器预览：`node prototype\serve.mjs`，访问 `http://localhost:5178/settings.html`。
- Windows 宿主：`host/DesktopHost.cs`；改主题 HTML/JS 不需要重新编译宿主，托盘“重新载入”即可。
- 产品显示名为 `Wallpaper`；程序读写 `%LOCALAPPDATA%\Wallpaper`，安装到 `Programs\Wallpaper`，启动项和运行实例标识也独立，不要与其他产品共用身份。
- 2026-11-18 更名：项目由 Deskland 体验版更名为 `Wallpaper`，版本重置为 `0.0.1`，logo 重设计（`host/Wallpaper.ico`、`docs/images/logo.png`）；数据目录、安装目录、注册表、事件名等标识同步更换，不迁移旧 DesklandPreview 数据。
- 不提交 `host/bin/`、`host/lib/`、个人数据、凭证或本机路径。
- 发布或修改商标相关内容前须获得项目负责人的明确指示。
- 许可见 `LICENSE`，名称和图标的说明见 `TRADEMARKS.md`。
- 仓库：`https://github.com/xiaowulai-s/Wallpaper`，Release 下载入口见 README。
- 历史记录：2026-11-06 发布 Deskland 体验版 `v0.1.2`；2026-11-07 发布 `v0.1.3`（启动与缩略图修复，安装包 43 文件，SHA256 `e253cad56f1ea0ee2fb9d13ebe8a44f7dbe7232a506ba752cbe54c939c17bf44`）。2026-11-18 完成 11 个未公开主题开发（粉色森林、森林、彩色城市、手绘城市、大海、天空、湖泊、老地图、航海地图、荷塘、马尔代夫），全部经浏览器、设置页与真实宿主三重验证。SourceForge 在当前网络不可直连 NSIS 二进制，打包用本机已验证的 NSIS 3.11 编译器（Tauri 缓存）。
