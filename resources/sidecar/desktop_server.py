"""Sidecar CHỈ ĐỌC của MMC studio: liệt kê cửa sổ và đọc cây UI Automation của Windows.

Giao thức: mỗi dòng stdin là một yêu cầu JSON {"id", "method", "params"}; mỗi dòng stdout là
{"id", "result"} hoặc {"id", "error"}. Toạ độ trả về là pixel VẬT LÝ (process DPI-aware);
app (main process) tự đổi sang toạ độ logic. Không có hàm nào click, gõ phím hay thay đổi gì.
Giá trị của ô mật khẩu (UIA IsPassword) không bao giờ được đọc.
"""

import ctypes
import json
import sys
import time

# Phải đặt trước khi import pywinauto để toạ độ là pixel vật lý trên mọi màn hình.
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)  # PER_MONITOR_AWARE
except Exception:  # noqa: BLE001 — Windows cũ: bỏ qua
    pass

import psutil  # noqa: E402
import win32gui  # noqa: E402
from pywinauto import Desktop  # noqa: E402
from pywinauto.controls.uiawrapper import UIAWrapper  # noqa: E402
from pywinauto.uia_element_info import UIAElementInfo  # noqa: E402

PROTOCOL_VERSION = 1
MAX_TEXT = 200


def _text(value):
    if value is None:
        return ""
    s = str(value).replace("\r", " ").replace("\n", " ").strip()
    return s if len(s) <= MAX_TEXT else s[: MAX_TEXT - 1] + "…"


def _rect(info):
    try:
        r = info.rectangle
        return [r.left, r.top, r.right, r.bottom]
    except Exception:  # noqa: BLE001
        return None


def _process_name(pid):
    try:
        return psutil.Process(pid).name()
    except Exception:  # noqa: BLE001
        return ""


def list_windows(_params):
    foreground = win32gui.GetForegroundWindow()
    result = []
    for w in Desktop(backend="uia").windows(visible_only=True):
        info = w.element_info
        title = _text(info.name)
        if not title:
            continue
        handle = info.handle or 0
        result.append(
            {
                "handle": handle,
                "title": title,
                "process": _process_name(info.process_id),
                "pid": info.process_id,
                "rect": _rect(info),
                "minimized": bool(handle and win32gui.IsIconic(handle)),
                "focused": handle == foreground,
            }
        )
    return result


def _is_password(info):
    try:
        return bool(info.element.CurrentIsPassword)
    except Exception:  # noqa: BLE001
        return False


def _value(info, password):
    if password:
        return None  # không bao giờ đọc mật khẩu
    try:
        return _text(UIAWrapper(info).iface_value.CurrentValue) or None
    except Exception:  # noqa: BLE001
        return None


def ui_tree(params):
    handle = int(params["handle"])
    max_depth = max(1, min(int(params.get("max_depth", 4)), 8))
    max_nodes = max(10, min(int(params.get("max_nodes", 250)), 600))
    budget = time.monotonic() + max(1.0, min(float(params.get("time_budget", 8)), 20))
    if not win32gui.IsWindow(handle):
        raise ValueError("window_not_found")

    root = UIAElementInfo(handle)
    nodes = []
    truncated = False
    stack = [(root, 0)]
    while stack:
        if len(nodes) >= max_nodes or time.monotonic() > budget:
            truncated = True
            break
        info, depth = stack.pop()
        password = _is_password(info)
        node = {
            "depth": depth,
            "type": info.control_type or "",
            "name": _text(info.name),
            "id": _text(info.automation_id),
            "rect": _rect(info),
            "enabled": bool(info.enabled),
        }
        if password:
            node["password"] = True
        value = _value(info, password)
        if value and value != node["name"]:
            node["value"] = value
        nodes.append(node)
        if depth < max_depth:
            try:
                children = info.children()
            except Exception:  # noqa: BLE001
                children = []
            # Đảo ngược để duyệt theo thứ tự hiển thị (stack LIFO).
            stack.extend((c, depth + 1) for c in reversed(children))
        elif info.children():
            node["more"] = True
    return {"nodes": nodes, "truncated": truncated}


def ping(_params):
    return {"protocol": PROTOCOL_VERSION, "python": sys.version.split()[0]}


METHODS = {"ping": ping, "list_windows": list_windows, "ui_tree": ui_tree}


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
    # stdout UTF-8 bất kể code page của Windows.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin.reconfigure(encoding="utf-8")
    main()
