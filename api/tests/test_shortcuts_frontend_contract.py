"""快捷键前后端契约测试(Codex S-19 回归的强制化)。

api/routers/settings.py 的 DEFAULT_SHORTCUTS 必须与
frontend/src/Settings/shortcuts/defaultShortcuts.ts 字节一致——此前只靠注释
提醒,已实际漂移过一次(后端缺键+值不同,c6295f2 修复)。本测试从 TS 源文件
正则提取快捷键表做全字典比对,任一侧增删改键都会失败。
"""
import re
from pathlib import Path

from routers.settings import DEFAULT_SHORTCUTS as backend_shortcuts


def _extract_frontend_shortcuts() -> dict:
    ts_path = (
        Path(__file__).resolve().parents[2]
        / "frontend/src/Settings/shortcuts/defaultShortcuts.ts"
    )
    src = ts_path.read_text(encoding="utf-8")
    m = re.search(r"export const DEFAULT_SHORTCUTS[^=]*=\s*\{(.*?)\n\};", src, re.DOTALL)
    assert m, (
        "DEFAULT_SHORTCUTS object literal not found in defaultShortcuts.ts — "
        "TS format changed, update the extraction regex here"
    )
    entries = re.findall(r"(\w+):\s*\{([^{}]*)\}", m.group(1))
    assert entries, "no shortcut entries extracted — TS format changed"
    result = {}
    for action_id, fields in entries:
        sm = re.search(r"shortcut:\s*'([^']*)'", fields)
        assert sm, f"no 'shortcut' field found for {action_id}"
        result[action_id] = sm.group(1)
    return result


def test_backend_shortcuts_match_frontend():
    frontend_shortcuts = _extract_frontend_shortcuts()
    assert frontend_shortcuts == backend_shortcuts, (
        "api/routers/settings.py DEFAULT_SHORTCUTS drifted from "
        "frontend/src/Settings/shortcuts/defaultShortcuts.ts (see Codex S-19)"
    )
