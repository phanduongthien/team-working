"""Test THẬT của voice_server.py: chép lời một file WAV mẫu bằng faster-whisper (model base, CPU).

Chạy trong CI (job "Voice sidecar") để bắt lỗi kiểu thư viện không tương thích (vd PyAV bỏ tham số
mà faster-whisper vẫn dùng). Cần: thư viện trong requirements-voice.txt + thư mục model ở biến
MMC_WHISPER_MODEL_DIR. Chạy: python resources/sidecar/tests/test_voice_server.py
"""

import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(HERE, "..", "voice_server.py")
SAMPLE = os.path.join(HERE, "sample-vi.wav")


class Server:
    def __init__(self):
        self.p = subprocess.Popen(
            [sys.executable, SERVER], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8"
        )
        self.n = 0

    def call(self, method, params=None):
        self.n += 1
        self.p.stdin.write(json.dumps({"id": self.n, "method": method, "params": params or {}}) + "\n")
        self.p.stdin.flush()
        return json.loads(self.p.stdout.readline())

    def close(self):
        self.p.stdin.close()
        self.p.wait(timeout=30)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    model_dir = os.environ.get("MMC_WHISPER_MODEL_DIR")
    assert model_dir and os.path.isdir(model_dir), "Đặt MMC_WHISPER_MODEL_DIR = thư mục model faster-whisper"
    s = Server()
    try:
        assert s.call("ping")["result"]["ok"]

        # 1. Chép lời thật (CPU, int8) — giống đường đi của app, không khoá ngôn ngữ.
        r = s.call("stt", {"path": SAMPLE, "model_dir": model_dir, "device": "cpu", "compute_type": "int8",
                           "initial_prompt": "Mizuki ơi, build Unity bị bug shader, arigatou nha."})
        assert "error" not in r, f"stt lỗi: {r.get('error')}"
        text = r["result"]["text"]
        print("chép lời:", text, "| ngôn ngữ:", r["result"]["language"])
        assert len(text.strip()) >= 3, "không chép ra chữ nào"

        # 2. File hỏng → AudioDecodeError (KHÔNG được nhầm là lỗi GPU).
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(b"not a wav file")
        bad = s.call("stt", {"path": f.name, "model_dir": model_dir, "device": "cpu"})
        os.unlink(f.name)
        assert "AudioDecodeError" in bad.get("error", ""), bad
        print("OK")
    finally:
        s.close()


if __name__ == "__main__":
    main()
