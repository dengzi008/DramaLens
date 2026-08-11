import argparse
import json
import urllib.error
import urllib.request
import tkinter as tk
from tkinter import messagebox

try:
    import keyboard
except Exception:
    keyboard = None


class Controller:
    def __init__(self, port):
        self.base = f"http://127.0.0.1:{port}"
        self.root = tk.Tk()
        self.root.title("DramaLens 连续采集")
        self.root.attributes("-topmost", True)
        self.root.geometry("390x250+40+80")
        self.root.resizable(False, False)
        self.title_var = tk.StringVar(value="正在连接本地服务…")
        self.episode_var = tk.StringVar(value="当前：—")
        self.duration_var = tk.StringVar(value="录制：00:00")
        self.queue_var = tk.StringVar(value="已完成：0　等待识别：0")
        self.hint_var = tk.StringVar(value="F8：本集结束并开始下一集　F10：结束全部")
        self._build()
        self._install_hotkeys()
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.poll()

    def _build(self):
        frame = tk.Frame(self.root, padx=18, pady=16)
        frame.pack(fill="both", expand=True)
        tk.Label(frame, textvariable=self.title_var, font=("Microsoft YaHei UI", 13, "bold"), anchor="w").pack(fill="x")
        tk.Label(frame, textvariable=self.episode_var, font=("Microsoft YaHei UI", 18, "bold"), fg="#1769e0").pack(pady=(18, 2))
        tk.Label(frame, textvariable=self.duration_var, font=("Consolas", 13)).pack()
        tk.Label(frame, textvariable=self.queue_var, font=("Microsoft YaHei UI", 10), fg="#555").pack(pady=(6, 14))
        buttons = tk.Frame(frame)
        buttons.pack(fill="x")
        self.next_btn = tk.Button(buttons, text="本集结束，开始下一集  F8", command=self.next_episode, bg="#1769e0", fg="white", height=2)
        self.next_btn.pack(side="left", fill="x", expand=True, padx=(0, 6))
        self.finish_btn = tk.Button(buttons, text="结束全部  F10", command=self.finish, height=2)
        self.finish_btn.pack(side="left", padx=(6, 0))
        tk.Label(frame, textvariable=self.hint_var, font=("Microsoft YaHei UI", 9), fg="#777").pack(pady=(12, 0))

    def _install_hotkeys(self):
        if keyboard is None:
            self.hint_var.set("全局快捷键不可用，请点击按钮操作。")
            return
        try:
            keyboard.add_hotkey("f8", lambda: self.root.after(0, self.next_episode))
            keyboard.add_hotkey("f10", lambda: self.root.after(0, self.finish))
        except Exception:
            self.hint_var.set("快捷键注册失败，请点击按钮操作。")

    def request(self, path, method="GET", payload=None):
        data = None
        headers = {}
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            try:
                body = json.loads(error.read().decode("utf-8"))
                raise RuntimeError(body.get("error") or str(error))
            except json.JSONDecodeError:
                raise RuntimeError(str(error))

    def next_episode(self):
        try:
            self.next_btn.config(state="disabled")
            self.request("/api/batch/next", method="POST")
            self.poll(immediate=True)
        except Exception as error:
            messagebox.showerror("切集失败", str(error), parent=self.root)
        finally:
            self.next_btn.config(state="normal")

    def finish(self):
        if not messagebox.askyesno("结束全部", "确定结束当前集并停止连续采集吗？", parent=self.root):
            return
        try:
            self.finish_btn.config(state="disabled")
            self.request("/api/batch/finish", method="POST")
            self.poll(immediate=True)
        except Exception as error:
            messagebox.showerror("结束失败", str(error), parent=self.root)
        finally:
            self.finish_btn.config(state="normal")

    def poll(self, immediate=False):
        try:
            state = self.request("/api/batch/status")
            self.title_var.set(state.get("title") or "DramaLens 连续采集")
            current = state.get("currentEpisode")
            self.episode_var.set(f"当前：第{current}集" if current else f"状态：{state.get('status', 'idle')}")
            seconds = int(state.get("currentDuration") or 0)
            self.duration_var.set(f"录制：{seconds // 60:02d}:{seconds % 60:02d}")
            counts = state.get("counts") or {}
            waiting = sum(counts.get(key, 0) for key in ("queued", "transcribing"))
            done = sum(counts.get(key, 0) for key in ("transcribed", "complete"))
            errors = sum(counts.get(key, 0) for key in ("error", "ai-error"))
            self.queue_var.set(f"已完成：{done}　等待识别：{waiting}　失败：{errors}")
            recording = state.get("status") == "recording"
            self.next_btn.config(state="normal" if recording else "disabled")
            self.finish_btn.config(state="normal" if recording else "disabled")
        except Exception as error:
            self.title_var.set("无法连接 DramaLens 本地服务")
            self.queue_var.set(str(error))
        if not immediate:
            self.root.after(1000, self.poll)

    def close(self):
        if keyboard is not None:
            try:
                keyboard.unhook_all_hotkeys()
            except Exception:
                pass
        self.root.destroy()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=3211)
    Controller(parser.parse_args().port).run()
