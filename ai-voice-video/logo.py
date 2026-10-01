"""「ありがとうグループ」文字ロゴ（紺・オレンジ）。明るい背景用と暗い背景用を作る。"""
from PIL import Image, ImageDraw, ImageFont

NAVY = (31, 58, 95)
ORANGE = (232, 131, 58)
WHITE = (255, 255, 255)
MAIN = "/usr/share/fonts/opentype/mplus/Mplus2-ExtraBold.otf"
SUB = "/usr/share/fonts/opentype/mplus/Mplus2-Bold.otf"


def logo(main_color, sub_color, path, scale=4):
    f1 = ImageFont.truetype(MAIN, 120 * scale)
    f2 = ImageFont.truetype(SUB, 62 * scale)
    t1, t2 = "ありがとう", "グループ"
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    b1 = probe.textbbox((0, 0), t1, font=f1)
    b2 = probe.textbbox((0, 0), t2, font=f2)
    w1, h1 = b1[2] - b1[0], b1[3] - b1[1]
    w2 = b2[2] - b2[0]
    gap = 26 * scale
    pad = 20 * scale
    W = pad * 2 + w1 + gap + w2
    H = pad * 2 + h1 + 64 * scale
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x, y = pad - b1[0], pad - b1[1]
    d.text((x, y), t1, font=f1, fill=main_color)
    # 「グループ」は「ありがとう」の下端にそろえる
    base = pad + h1
    d.text((pad + w1 + gap - b2[0], base - (b2[3] - b2[1]) - b2[1]), t2, font=f2, fill=sub_color)
    # 笑顔のような弧（オレンジ）を「ありがとう」の下に
    arc_w = int(w1 * 0.62)
    ax = pad + (w1 - arc_w) // 2
    ay = base + 8 * scale
    d.arc((ax, ay - 40 * scale, ax + arc_w, ay + 44 * scale), 25, 155, fill=ORANGE, width=11 * scale)
    im.save(path)
    return im


if __name__ == "__main__":
    logo(NAVY, NAVY, "logo_navy.png")
    logo(WHITE, WHITE, "logo_white.png")
    # 見本（明るい背景と暗い背景に置いたところ）
    a, b = Image.open("logo_navy.png"), Image.open("logo_white.png")
    sheet = Image.new("RGB", (a.width + 200, a.height * 2 + 300), (250, 247, 242))
    ImageDraw.Draw(sheet).rectangle((0, a.height + 150, sheet.width, sheet.height), fill=NAVY)
    sheet.paste(a, (100, 75), a)
    sheet.paste(b, (100, a.height + 225), b)
    sheet.resize((sheet.width // 4, sheet.height // 4)).save("logo_sample.png")
