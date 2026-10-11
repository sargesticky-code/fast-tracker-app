"""One bounded child capture: the parent enforces wall-clock and process isolation."""
import asyncio
import json
import os
from pathlib import Path
import sys

os.environ["FT_COLLECTOR_CHILD"] = "1"
from app import refresh_once  # noqa: E402

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Expected an output path")
    fixtures, snapshot = asyncio.run(refresh_once())
    dest = Path(sys.argv[1])
    tmp = dest.with_suffix(".tmp")
    tmp.write_text(
        json.dumps({"fixtures": fixtures, "snapshot": snapshot}, ensure_ascii=False),
        encoding="utf-8",
    )
    tmp.replace(dest)
