"""Expose versioned release notes as a multiline GitHub Actions output."""

from __future__ import annotations

import json
import os
from pathlib import Path


def resolve_release_version(root: Path, ref_type: str, ref_name: str) -> str:
    if ref_type == "tag" and ref_name.startswith("v"):
        return ref_name[1:]
    package = json.loads((root / "frontend/package.json").read_text(encoding="utf-8"))
    return str(package["version"])


def load_release_notes(root: Path, version: str) -> str:
    notes_path = root / "docs" / "releases" / f"v{version}.md"
    if not notes_path.is_file():
        raise FileNotFoundError(f"Missing release notes: {notes_path}")
    notes = notes_path.read_text(encoding="utf-8").strip()
    english_path = root / "docs" / "releases" / f"v{version}_en.md"
    if english_path.is_file():
        english = english_path.read_text(encoding="utf-8").strip()
        notes = f"{notes}\n\n---\n\n{english}"
    return notes


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    version = resolve_release_version(
        root,
        os.environ.get("GITHUB_REF_TYPE", ""),
        os.environ.get("GITHUB_REF_NAME", ""),
    )
    notes = load_release_notes(root, version)
    output_path = os.environ.get("GITHUB_OUTPUT")
    if not output_path:
        raise RuntimeError("GITHUB_OUTPUT is required")
    delimiter = "DUCKQUERY_RELEASE_NOTES_EOF"
    if delimiter in notes:
        raise ValueError("Release notes contain the reserved output delimiter")
    with open(output_path, "a", encoding="utf-8") as output:
        output.write(f"body<<{delimiter}\n{notes}\n{delimiter}\n")


if __name__ == "__main__":
    main()
