from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
out = root / 'build'
sizes = [(size, size) for size in (16, 20, 24, 32, 40, 48, 64, 96, 128, 256)]
with Image.open(out / 'icon.png') as image:
    if image.width != image.height or image.width < 256:
        raise ValueError('The source icon must be square and at least 256 pixels wide.')
    image.convert('RGBA').save(out / 'icon.ico', sizes=sizes)
print(out / 'icon.ico')
