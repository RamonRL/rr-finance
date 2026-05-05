from pathlib import Path
from PIL import Image

HERE = Path(__file__).parent
SOURCE = HERE / "newlogo.png"


def square_with_background(src: Path, bg: tuple[int, int, int]) -> Image.Image:
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    side = max(w, h)

    canvas = Image.new("RGBA", (side, side), (*bg, 255))
    offset = ((side - w) // 2, (side - h) // 2)
    canvas.alpha_composite(img, dest=offset)
    return canvas.convert("RGB")


def main() -> None:
    variants = {
        "newlogo_square_white.png": (255, 255, 255),
        "newlogo_square_black.png": (0, 0, 0),
    }
    for name, bg in variants.items():
        out = HERE / name
        square_with_background(SOURCE, bg).save(out, format="PNG", optimize=True)
        print(f"wrote {out} ({Image.open(out).size})")


if __name__ == "__main__":
    main()
