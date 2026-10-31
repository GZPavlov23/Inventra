"""Downloads the training data. Run once, about 115 MB.

FreshRetailNet-50K by Dingdong-Inc, licensed under CC BY 4.0:
https://huggingface.co/datasets/Dingdong-Inc/FreshRetailNet-50K
"""

from pathlib import Path
from urllib.request import urlretrieve

BASE_URL = "https://huggingface.co/datasets/Dingdong-Inc/FreshRetailNet-50K/resolve/main/data"
RAW_DATA = Path(__file__).parent / "data" / "raw"


def main() -> None:
    RAW_DATA.mkdir(parents=True, exist_ok=True)
    for name in ("train.parquet", "eval.parquet"):
        target = RAW_DATA / name
        if target.exists():
            print(f"{name} is already here")
            continue
        print(f"Downloading {name}")
        urlretrieve(f"{BASE_URL}/{name}", target)
    print(f"Done: {RAW_DATA}")


if __name__ == "__main__":
    main()
