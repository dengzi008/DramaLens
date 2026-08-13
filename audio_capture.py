import os
import platform

import soundcard as sc


def platform_name():
    return platform.system() or "Unknown"


def capture_backend():
    system = platform_name()
    if system == "Windows":
        return "wasapi-loopback"
    if system == "Darwin":
        return "coreaudio-input"
    return "unsupported"


def capture_device_hint():
    if platform_name() == "Darwin":
        return os.getenv("MACOS_AUDIO_DEVICE", "BlackHole")
    return "default-speaker"


def get_desktop_capture_microphone():
    system = platform_name()
    if system == "Windows":
        speaker = sc.default_speaker()
        if speaker is None:
            raise RuntimeError("没有找到 Windows 默认扬声器。")
        microphone = sc.get_microphone(id=str(speaker.name), include_loopback=True)
        if microphone is None:
            raise RuntimeError("无法创建 Windows WASAPI 回环录音设备。")
        return microphone

    if system == "Darwin":
        requested = os.getenv("MACOS_AUDIO_DEVICE", "BlackHole").strip().lower()
        microphones = list(sc.all_microphones(include_loopback=False))
        for microphone in microphones:
            if requested in str(microphone.name).lower():
                return microphone
        available = ", ".join(str(item.name) for item in microphones) or "无"
        raise RuntimeError(
            "没有找到 macOS 桌面音频设备。请安装 BlackHole 2ch，"
            "在“音频 MIDI 设置”中把系统声音输出到 BlackHole，"
            "或在 .env 中设置 MACOS_AUDIO_DEVICE。"
            f" 当前可用输入设备：{available}"
        )

    raise RuntimeError(f"当前系统暂不支持桌面音频采集：{system}")


def capture_capabilities():
    system = platform_name()
    return {
        "platform": system,
        "desktopCaptureSupported": system in {"Windows", "Darwin"},
        "audioBackend": capture_backend(),
        "audioDeviceHint": capture_device_hint(),
    }
