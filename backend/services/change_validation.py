"""Fail closed before applying model-produced repository changes."""
from pathlib import PurePosixPath
from typing import Iterable
from models import CodeChange


def safe_path(path: str) -> str:
    parts = PurePosixPath(path).parts
    if (not parts or path.startswith("/") or "\\" in path
            or any(p in ("..", ".git") for p in parts)
            or str(PurePosixPath(path)) != path):
        raise ValueError(f"Unsafe repository path: {path}")
    return path


def validate_changes(changes: Iterable[CodeChange], contents: dict, file_paths: set):
    seen = set()
    for change in changes:
        path = safe_path(change.file_path)
        if path in seen:
            raise ValueError(f"Duplicate change: {path}")
        seen.add(path)
        if change.change_type not in {"create", "modify", "delete"}:
            raise ValueError(f"Unsupported change type: {change.change_type}")
        if change.change_type == "create":
            if path in file_paths:
                raise ValueError(f"Cannot create existing file: {path}")
        elif path not in contents:
            raise ValueError(f"Complete original content required for {path}")
        if change.change_type == "modify" and not change.new_content and contents[path]:
            raise ValueError(f"Refusing to empty existing file: {path}")
        change.original_content = contents.get(path)
