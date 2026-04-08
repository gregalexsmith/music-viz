"""Stage 2 — Source Separation via Demucs."""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Callable

STEM_NAMES = ("vocals", "drums", "bass", "other")


def run_separate(
    audio_path: Path,
    fingerprint_dir: Path,
    model: str = "htdemucs",
    progress_cb: Callable[[float, str], None] | None = None,
) -> dict[str, str]:
    """Run Demucs and write stems to ``fingerprint_dir/stems/{stem}.wav``."""
    stems_dir = fingerprint_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)

    if progress_cb:
        progress_cb(0.0, "Loading Demucs model")

    # Run demucs as a subprocess so it can stream progress to stderr.
    # Output goes to a temp dir and is then moved to stems_dir.
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        cmd = [
            sys.executable,
            "-m",
            "demucs.separate",
            "-n",
            model,
            "-o",
            str(tmp_path),
            "--filename",
            "{stem}.{ext}",
            str(audio_path),
        ]

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert proc.stdout is not None
        output_lines: list[str] = []
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            output_lines.append(line)
            pct = _parse_progress(line)
            if pct is not None and progress_cb:
                progress_cb(pct, "Separating stems")
        proc.wait()
        if proc.returncode != 0:
            tail = "\n".join(output_lines[-20:]) or "(no output)"
            raise RuntimeError(
                f"Demucs failed with code {proc.returncode}:\n{tail}"
            )

        # Demucs writes to <out>/<model>/<filename without ext>/<stem>.wav
        # but with --filename '{stem}.{ext}' it places stems flat in the song dir.
        produced: dict[str, str] = {}
        for stem_file in tmp_path.rglob("*.wav"):
            stem_name = stem_file.stem
            if stem_name in STEM_NAMES:
                target = stems_dir / f"{stem_name}.wav"
                shutil.copy2(stem_file, target)
                produced[stem_name] = str(target)

        if not produced:
            raise RuntimeError("Demucs produced no stems")

    if progress_cb:
        progress_cb(1.0, "Stems written")
    return produced


def _parse_progress(line: str) -> float | None:
    """Best-effort parse of Demucs' tqdm progress output."""
    if "%" not in line:
        return None
    try:
        chunk = line.split("%", 1)[0].split()[-1]
        return float(chunk) / 100.0
    except (ValueError, IndexError):
        return None
