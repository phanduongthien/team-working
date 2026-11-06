"""Sidecar giọng nói của MMC studio: chép lời (faster-whisper) và đọc (edge-tts / Piper).

Cùng giao thức với desktop_server.py: mỗi dòng stdin là {"id", "method", "params"}, mỗi dòng stdout là
{"id", "result"} hoặc {"id", "error"}. Tiến trình riêng để tải model nặng không làm chậm phần đọc UI,
và tắt được để giải phóng RAM/VRAM. Không ghi âm, không phát âm thanh: app tự lo phần đó.
"""

import asyncio
import base64
import io
import json
import os
import sys
import wave

PROTOCOL_VERSION = 1


def _add_cuda_dll_dirs():
    """Thư viện CUDA cài qua pip (nvidia-cublas-cu12, nvidia-cudnn-cu12) nằm trong site-packages/nvidia/*/bin."""
    try:
        import nvidia  # noqa: PLC0415
    except ImportError:
        return
    for base in list(getattr(nvidia, "__path__", [])):
        for sub in ("cublas", "cudnn", "cuda_nvrtc"):
            d = os.path.join(base, sub, "bin")
            if os.path.isdir(d):
                os.add_dll_directory(d)
                os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")


_add_cuda_dll_dirs()

_whisper = {}  # (model_dir, device, compute_type) -> WhisperModel
_piper = {}


def ping(_params):
    return {"ok": True, "protocol": PROTOCOL_VERSION, "python": sys.version.split()[0]}


def devices(_params):
    """Có GPU CUDA dùng được không (ctranslate2 tự kiểm tra driver + thư viện)."""
    import ctranslate2  # noqa: PLC0415

    try:
        count = ctranslate2.get_cuda_device_count()
    except Exception:  # noqa: BLE001
        count = 0
    return {"cuda": count > 0, "count": count}


def _model(model_dir, device, compute_type):
    from faster_whisper import WhisperModel  # noqa: PLC0415

    key = (model_dir, device, compute_type)
    if key not in _whisper:
        _whisper.clear()  # chỉ giữ một model trong bộ nhớ
        _whisper[key] = WhisperModel(model_dir, device=device, compute_type=compute_type)
    return _whisper[key]


class AudioDecodeError(Exception):
    """Ghi âm không đọc được — KHÔNG phải lỗi GPU (app không được lùi về CPU vì lỗi này)."""


def load_wav(path):
    """WAV PCM 16-bit (app ghi ra) → numpy float32 mono 16 kHz. Không đi qua av.open của PyAV."""
    import numpy as np  # noqa: PLC0415

    try:
        with wave.open(path, "rb") as w:
            channels, width, rate, frames = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
            raw = w.readframes(frames)
    except (wave.Error, EOFError, OSError) as exc:
        raise AudioDecodeError(f"wav: {exc}") from exc
    if width != 2:
        raise AudioDecodeError(f"wav: cần PCM 16-bit, nhận {width * 8}-bit")
    audio = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    if rate != 16000:
        # Nội suy tuyến tính — app luôn gửi 16 kHz, nhánh này chỉ để an toàn.
        n = int(len(audio) * 16000 / rate)
        audio = np.interp(np.linspace(0, len(audio) - 1, n), np.arange(len(audio)), audio).astype(np.float32)
    return audio


def stt(params):
    """Chép lời file WAV. KHÔNG khoá ngôn ngữ: người dùng nói lẫn Việt/Anh/Nhật."""
    audio = load_wav(params["path"])
    model = _model(params["model_dir"], params.get("device", "cpu"), params.get("compute_type", "int8"))
    segments, info = model.transcribe(
        audio,
        language=params.get("language") or None,
        initial_prompt=params.get("initial_prompt") or None,
        vad_filter=True,
        beam_size=5,
        condition_on_previous_text=False,
    )
    text = " ".join(s.text.strip() for s in segments).strip()
    return {"text": text, "language": info.language, "duration": info.duration}


def unload(_params):
    _whisper.clear()
    _piper.clear()
    return {"ok": True}


async def _edge(text, voice, rate):
    import edge_tts  # noqa: PLC0415

    out = bytearray()
    async for chunk in edge_tts.Communicate(text, voice, rate=rate).stream():
        if chunk.get("type") == "audio":
            out.extend(chunk["data"])
    if not out:
        raise RuntimeError("edge_empty")
    return bytes(out)


def _piper_wav(text, model_path, rate):
    from piper import PiperVoice, SynthesisConfig  # noqa: PLC0415

    if model_path not in _piper:
        _piper.clear()
        _piper[model_path] = PiperVoice.load(model_path)
    voice = _piper[model_path]
    # rate "+20%" → nói nhanh hơn = length_scale nhỏ hơn
    pct = int(str(rate).replace("%", "") or 0)
    config = SynthesisConfig(length_scale=max(0.5, min(2.0, 1.0 / (1 + pct / 100))))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        voice.synthesize_wav(text, wav, syn_config=config)
    return buf.getvalue()


def tts(params):
    text = params["text"]
    rate = params.get("rate", "+0%")
    if params.get("engine") == "edge":
        data, mime = asyncio.run(_edge(text, params.get("voice", "vi-VN-HoaiMyNeural"), rate)), "audio/mpeg"
    else:
        data, mime = _piper_wav(text, params["piper_model"], rate), "audio/wav"
    return {"audio": base64.b64encode(data).decode("ascii"), "mime": mime}


METHODS = {"ping": ping, "devices": devices, "stt": stt, "tts": tts, "unload": unload}


def main():
    out = sys.stdout
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except ValueError:
            continue
        rid = req.get("id")
        method = METHODS.get(req.get("method"))
        try:
            if method is None:
                raise ValueError("unknown_method")
            reply = {"id": rid, "result": method(req.get("params") or {})}
        except Exception as exc:  # noqa: BLE001 — trả lỗi cho app, không chết tiến trình
            reply = {"id": rid, "error": f"{type(exc).__name__}: {exc}"}
        out.write(json.dumps(reply, ensure_ascii=False) + "\n")
        out.flush()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin.reconfigure(encoding="utf-8")
    main()
