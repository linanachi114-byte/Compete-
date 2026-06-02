"""为公网隧道 URL 生成可扫码 PNG。

用法：直接 python gen_qr.py，会在 frontend/ 下生成 compete-qr.png；
PNG 边长 600px，黑白高对比，微信/QQ/支付宝都能扫。
"""
import qrcode
from pathlib import Path
from qrcode.constants import ERROR_CORRECT_M

URL = "https://alto-perl-indicators-accurate.trycloudflare.com"
OUT = Path(__file__).parent / "frontend" / "compete-qr.png"

qr = qrcode.QRCode(
    version=None,                   # 自动按内容选最小版本
    error_correction=ERROR_CORRECT_M,  # 中等纠错；URL 不长，M 够用
    box_size=10,                    # 每个方格 10px → 整图约 410-500px
    border=4,                       # 4 格白边（QR 规范最小推荐值）
)
qr.add_data(URL)
qr.make(fit=True)

img = qr.make_image(fill_color="black", back_color="white")
img.save(OUT)
print(f"saved: {OUT}  size={img.size}")
print(f"扫码后访问: {URL}")
