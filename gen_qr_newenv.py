"""为新 .env 的公网隧道生成第二张 QR PNG（与老 QR 并存）。"""
import qrcode
from pathlib import Path
from qrcode.constants import ERROR_CORRECT_M

URL = "https://everyday-mere-processed-download.trycloudflare.com"
OUT = Path(__file__).parent / "frontend" / "compete-qr-newenv.png"

qr = qrcode.QRCode(
    version=None,
    error_correction=ERROR_CORRECT_M,
    box_size=10,
    border=4,
)
qr.add_data(URL)
qr.make(fit=True)
img = qr.make_image(fill_color="black", back_color="white")
img.save(OUT)
print(f"saved: {OUT}  size={img.size}")
print(f"扫码后访问: {URL}")
