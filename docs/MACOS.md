# macOS 使用说明

DramaLens 的 Chrome 扩展、语音转写、AI 拆解和 Word 导出均可在 macOS 使用。浏览器标签页音频可直接采集；录制红果等桌面 App 的系统声音时，需要用 BlackHole 将 CoreAudio 输出转换为可录制的输入设备。

## 环境要求

- macOS 13 或更高版本
- Chrome 或 Chromium 浏览器
- Python 3.11
- Apple Silicon 或 Intel Mac
- 录制桌面 App 时：BlackHole 2ch

## 安装

1. 下载或克隆 DramaLens 仓库。
2. 如需录制桌面 App，安装 BlackHole 2ch：

   ```bash
   brew install blackhole-2ch
   ```

3. 双击 `install-local-asr.command`。如果 macOS 阻止运行，可在终端执行：

   ```bash
   chmod +x install-local-asr.command start-asr.command
   ./install-local-asr.command
   ```

4. 复制配置文件：

   ```bash
   cp .env.example .env
   ```

5. 双击 `start-asr.command`，然后访问 `http://127.0.0.1:3211/api/health`。
6. 打开 `chrome://extensions/`，开启开发者模式，加载仓库中的 `extension` 文件夹。

## 配置桌面 App 录音

1. 打开 macOS 的“音频 MIDI 设置”。
2. 若只关心录音，可把系统声音输出切换到 `BlackHole 2ch`；若还要从扬声器听到声音，请建立包含 BlackHole 与扬声器的“多输出设备”。
3. 在 DramaLens 中开始项目采集，再播放目标 App。

默认寻找名称中包含 `BlackHole` 的输入设备。如果使用其他虚拟声卡，在 `.env` 中指定：

```env
MACOS_AUDIO_DEVICE=你的设备名称
```

## 权限与排错

- 首次运行时，允许终端或 Python 使用麦克风；这项权限用于读取 BlackHole 输入。
- 若提示找不到 BlackHole，重新打开终端和本地服务，并检查“音频 MIDI 设置”中是否存在该设备。
- 浏览器标签页采集不依赖 BlackHole。
- 本地模型首次运行会下载模型文件，耗时取决于网络和电脑性能。

请只处理自己拥有权利或已获授权的素材，并人工复核转写及分析结果。
