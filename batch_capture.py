import json
import queue
import re
import subprocess
import sys
import time
import wave
from difflib import SequenceMatcher
from pathlib import Path
from threading import Event, Lock, Thread

import numpy as np
import soundcard as sc


def episode_number(value):
    match = re.search(r"\d+", str(value or ""))
    return int(match.group()) if match else 1


def normalize_text(value):
    return re.sub(r"[\s，。！？、,.!?~～…]+", "", str(value or "")).lower()


def deduplicate_segments(segments):
    cleaned = []
    removed = 0
    for item in segments or []:
        current = dict(item)
        if not cleaned:
            cleaned.append(current)
            continue
        previous = cleaned[-1]
        left = normalize_text(previous.get("text"))
        right = normalize_text(current.get("text"))
        similarity = SequenceMatcher(None, left, right).ratio() if left and right else 0
        overlap = float(current.get("start", 0)) <= float(previous.get("end", 0)) + 0.25
        same_speaker = not previous.get("speaker") or not current.get("speaker") or previous.get("speaker") == current.get("speaker")
        if overlap and same_speaker and (left == right or similarity >= 0.96):
            previous["end"] = max(float(previous.get("end", 0)), float(current.get("end", 0)))
            if len(str(current.get("text", ""))) > len(str(previous.get("text", ""))):
                previous["text"] = current.get("text", "")
            removed += 1
            continue
        cleaned.append(current)
    for index, item in enumerate(cleaned):
        item["id"] = index
    return cleaned, removed


class BatchManager:
    def __init__(self, project_dir, transcribe_fn, analyze_fn):
        self.project_dir = Path(project_dir)
        self.root = self.project_dir / "recordings" / "batch"
        self.root.mkdir(parents=True, exist_ok=True)
        self.state_path = self.root / "current-session.json"
        self.transcribe_fn = transcribe_fn
        self.analyze_fn = analyze_fn
        self.lock = Lock()
        self.jobs = queue.Queue()
        self.worker = Thread(target=self._worker_loop, daemon=True)
        self.worker.start()
        self.ai_thread = None
        self.capture_thread = None
        self.capture_stop = Event()
        self.capture_path = None
        self.capture_frames = 0
        self.sample_rate = 48000
        self.channels = 2
        self.state = self._default_state()
        self._restore()

    def _default_state(self):
        return {
            "status": "idle",
            "title": "",
            "startEpisode": 1,
            "endEpisode": None,
            "currentEpisode": None,
            "currentStartedAt": None,
            "episodes": [],
            "aiStatus": "idle",
            "error": None,
            "sessionId": None,
        }

    def _restore(self):
        if not self.state_path.exists():
            return
        try:
            restored = json.loads(self.state_path.read_text(encoding="utf-8"))
            self.state = {**self._default_state(), **restored}
            if self.state["status"] in {"recording", "pausing", "stopping"}:
                self.state["status"] = "interrupted"
                self.state["error"] = "本地服务曾中断，当前录音无法恢复；已保存音频仍可继续识别。"
            for episode in self.state["episodes"]:
                if episode.get("status") in {"queued", "transcribing"} and Path(episode.get("audioPath", "")).exists():
                    episode["status"] = "queued"
                    self.jobs.put(episode["episode"])
            self._save()
        except Exception:
            self.state = self._default_state()

    def _save(self):
        snapshot = json.dumps(self.state, ensure_ascii=False, indent=2)
        temp = self.state_path.with_name(f".{self.state_path.name}.{time.time_ns()}.tmp")
        temp.write_text(snapshot, encoding="utf-8")
        temp.replace(self.state_path)

    def _public_state(self):
        with self.lock:
            source = json.loads(json.dumps(self.state, ensure_ascii=False))
            frames = self.capture_frames
        state = {key: value for key, value in source.items() if key != "episodes"}
        state["episodes"] = [
            {
                "episode": item.get("episode"),
                "label": item.get("label"),
                "duration": item.get("duration", 0),
                "status": item.get("status", "unknown"),
                "error": item.get("error"),
                "deduplicated": item.get("deduplicated", 0),
                "segmentCount": len(item.get("segments") or []),
            }
            for item in source.get("episodes", [])
        ]
        current_duration = frames / self.sample_rate if self.sample_rate else 0
        counts = {}
        for item in state["episodes"]:
            counts[item.get("status", "unknown")] = counts.get(item.get("status", "unknown"), 0) + 1
        state["currentDuration"] = round(current_duration, 1)
        state["counts"] = counts
        state["completedCount"] = len(state["episodes"])
        return state

    def status(self):
        return self._public_state()

    def _episode_file(self, number):
        session_dir = self.root / str(self.state["sessionId"])
        session_dir.mkdir(parents=True, exist_ok=True)
        return session_dir / f"episode-{number:04d}.wav"

    def _capture_loop(self, path):
        try:
            speaker = sc.default_speaker()
            if speaker is None:
                raise RuntimeError("没有找到 Windows 默认扬声器。")
            microphone = sc.get_microphone(id=str(speaker.name), include_loopback=True)
            with wave.open(str(path), "wb") as wav_file:
                wav_file.setnchannels(self.channels)
                wav_file.setsampwidth(2)
                wav_file.setframerate(self.sample_rate)
                with microphone.recorder(samplerate=self.sample_rate, channels=self.channels) as recorder:
                    while not self.capture_stop.is_set():
                        data = recorder.record(numframes=4800)
                        if data is None or not len(data):
                            continue
                        pcm = (np.clip(data, -1.0, 1.0) * 32767).astype(np.int16)
                        wav_file.writeframes(pcm.tobytes())
                        with self.lock:
                            self.capture_frames += len(pcm)
        except Exception as error:
            with self.lock:
                self.state["status"] = "error"
                self.state["error"] = str(error) or "批量录音失败。"
                self._save()

    def _start_capture(self, number):
        path = self._episode_file(number)
        path.unlink(missing_ok=True)
        self.capture_path = path
        self.capture_frames = 0
        self.capture_stop.clear()
        self.capture_thread = Thread(target=self._capture_loop, args=(path,), daemon=True)
        self.capture_thread.start()
        self.state["currentEpisode"] = number
        self.state["currentStartedAt"] = int(time.time() * 1000)
        self.state["status"] = "recording"
        self.state["error"] = None
        self._save()

    def start(self, title, start_episode, end_episode=None):
        with self.lock:
            if self.state["status"] in {"recording", "pausing", "stopping", "processing"}:
                raise ValueError("已有连续采集任务正在进行。")
            if any(item.get("status") in {"queued", "transcribing", "ai-processing"} for item in self.state["episodes"]):
                raise ValueError("上一批后台任务尚未完成。")
            start_number = episode_number(start_episode)
            end_number = episode_number(end_episode) if str(end_episode or "").strip() else None
            if end_number is not None and end_number < start_number:
                raise ValueError("结束集数不能小于起始集数。")
            self.state = self._default_state()
            self.state.update({
                "title": str(title or "未命名短剧").strip(),
                "startEpisode": start_number,
                "endEpisode": end_number,
                "sessionId": time.strftime("%Y%m%d-%H%M%S"),
            })
            self._start_capture(start_number)
        return self.status()

    def _stop_capture(self):
        thread = self.capture_thread
        path = self.capture_path
        frames = self.capture_frames
        self.capture_stop.set()
        if thread:
            thread.join(timeout=10)
        if thread and thread.is_alive():
            raise RuntimeError("结束本集录音超时，请重启本地服务。")
        if frames < self.sample_rate:
            path.unlink(missing_ok=True)
            raise ValueError("本集录音不足1秒。")
        self.capture_thread = None
        self.capture_path = None
        self.capture_frames = 0
        return path, frames / self.sample_rate

    def next_episode(self):
        with self.lock:
            if self.state["status"] != "recording":
                raise ValueError("当前不在连续录制状态。")
            current = self.state["currentEpisode"]
            self.state["status"] = "pausing"
            self._save()
        path, duration = self._stop_capture()
        with self.lock:
            episode = {
                "episode": current,
                "label": f"第{current}集",
                "audioPath": str(path),
                "duration": round(duration, 1),
                "status": "queued",
                "segments": [],
                "analysis": None,
                "error": None,
                "deduplicated": 0,
            }
            self.state["episodes"] = [item for item in self.state["episodes"] if item.get("episode") != current]
            self.state["episodes"].append(episode)
            self.state["episodes"].sort(key=lambda item: item.get("episode", 0))
            next_number = current + 1
            if self.state["endEpisode"] is not None and next_number > self.state["endEpisode"]:
                self.state["status"] = "processing"
                self.state["currentEpisode"] = None
                self.state["currentStartedAt"] = None
            else:
                self._start_capture(next_number)
            self._save()
        self.jobs.put(current)
        return self.status()

    def finish(self):
        with self.lock:
            if self.state["status"] != "recording":
                raise ValueError("当前不在连续录制状态。")
            current = self.state["currentEpisode"]
            self.state["status"] = "stopping"
            self._save()
        path, duration = self._stop_capture()
        with self.lock:
            episode = {
                "episode": current,
                "label": f"第{current}集",
                "audioPath": str(path),
                "duration": round(duration, 1),
                "status": "queued",
                "segments": [],
                "analysis": None,
                "error": None,
                "deduplicated": 0,
            }
            self.state["episodes"] = [item for item in self.state["episodes"] if item.get("episode") != current]
            self.state["episodes"].append(episode)
            self.state["episodes"].sort(key=lambda item: item.get("episode", 0))
            self.state["status"] = "processing"
            self.state["currentEpisode"] = None
            self.state["currentStartedAt"] = None
            self._save()
        self.jobs.put(current)
        return self.status()

    def _find_episode(self, number):
        return next((item for item in self.state["episodes"] if item.get("episode") == number), None)

    def _worker_loop(self):
        while True:
            number = self.jobs.get()
            try:
                with self.lock:
                    episode = self._find_episode(number)
                    if not episode:
                        continue
                    episode["status"] = "transcribing"
                    episode["error"] = None
                    self._save()
                    path = Path(episode["audioPath"])
                result = self.transcribe_fn(path)
                cleaned, removed = deduplicate_segments(result.get("segments") or [])
                if not cleaned:
                    raise ValueError("没有识别到有效语音，请确认本集有声音后重试。")
                with self.lock:
                    episode = self._find_episode(number)
                    episode["segments"] = cleaned
                    episode["text"] = "".join(item.get("text", "") for item in cleaned)
                    episode["deduplicated"] = removed
                    episode["status"] = "transcribed"
                    episode["error"] = None
                    self._update_overall_status()
                    self._save()
            except Exception as error:
                with self.lock:
                    episode = self._find_episode(number)
                    if episode:
                        episode["status"] = "error"
                        episode["error"] = str(error) or "识别失败。"
                    self._update_overall_status()
                    self._save()
            finally:
                self.jobs.task_done()

    def _update_overall_status(self):
        if self.state["status"] == "recording":
            return
        pending = any(item.get("status") in {"queued", "transcribing"} for item in self.state["episodes"])
        if not pending and self.state["status"] in {"processing", "stopping", "interrupted"}:
            self.state["status"] = "ready"

    def retry(self, number):
        number = episode_number(number)
        with self.lock:
            episode = self._find_episode(number)
            if not episode:
                raise ValueError("没有找到指定集数。")
            if not Path(episode.get("audioPath", "")).exists():
                raise ValueError("该集音频文件不存在，无法重试。")
            episode["status"] = "queued"
            episode["error"] = None
            self._save()
        self.jobs.put(number)
        return self.status()

    def start_ai(self):
        with self.lock:
            if self.ai_thread and self.ai_thread.is_alive():
                raise ValueError("批量AI任务正在进行。")
            candidates = [item.get("episode") for item in self.state["episodes"] if item.get("status") in {"transcribed", "ai-error"} and item.get("segments")]
            if not candidates:
                raise ValueError("没有等待AI处理的已识别集数。")
            self.state["aiStatus"] = "processing"
            self._save()
            self.ai_thread = Thread(target=self._ai_loop, args=(candidates,), daemon=True)
            self.ai_thread.start()
        return self.status()

    def _ai_loop(self, numbers):
        for number in numbers:
            try:
                with self.lock:
                    episode = self._find_episode(number)
                    episode["status"] = "ai-processing"
                    self._save()
                    payload = {"title": self.state["title"], "episode": episode["label"], "segments": episode["segments"]}
                report = self.analyze_fn(payload)
                with self.lock:
                    episode = self._find_episode(number)
                    corrected = {str(item.get("id")): item for item in report.get("corrected_segments", [])}
                    for segment in episode["segments"]:
                        correction = corrected.get(str(segment.get("id")))
                        if correction:
                            segment["speaker"] = correction.get("speaker") or segment.get("speaker") or "待确认"
                            segment["text"] = correction.get("text") or segment.get("text") or ""
                    episode["analysis"] = report
                    episode["status"] = "complete"
                    episode["error"] = None
                    self._save()
            except Exception as error:
                with self.lock:
                    episode = self._find_episode(number)
                    if episode:
                        episode["status"] = "ai-error"
                        episode["error"] = str(error) or "AI处理失败。"
                    self._save()
        with self.lock:
            self.state["aiStatus"] = "complete"
            self._save()

    def results(self):
        with self.lock:
            episodes = []
            for item in self.state["episodes"]:
                episodes.append({
                    "episode": item.get("label"),
                    "filename": Path(item.get("audioPath", "")).name,
                    "segments": item.get("segments") or [],
                    "analysis": item.get("analysis"),
                    "status": item.get("status"),
                    "error": item.get("error"),
                })
            return {"title": self.state["title"], "episodes": episodes}

    def open_controller(self, port):
        script = self.project_dir / "batch_controller.py"
        subprocess.Popen(
            [sys.executable, str(script), "--port", str(port)],
            cwd=str(self.project_dir),
            creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
        )
        return {"ok": True}
