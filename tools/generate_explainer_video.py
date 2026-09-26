#!/usr/bin/env python3
"""
Indian Form Helper - Master Hinglish Explainer & Benefits Video Generator
Produces:
- Crystal-clear 1080p Full HD video slides with smartphone mockups & vector icons.
- Professional Hinglish voiceover with Indian English accent.
- Dynamic audio ducking with subtle ambient background soundtrack.
- Master MP4 export and standalone web player.
"""

import os
import sys
import math
import struct
import wave
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1920, 1080
FFMPEG = "/opt/homebrew/bin/ffmpeg"
FFPROBE = "/opt/homebrew/bin/ffprobe"
WORKSPACE = Path(__file__).resolve().parent.parent
OUTPUT_DIR = WORKSPACE / "videos"
DOCS_VIDEO_DIR = WORKSPACE / "docs" / "video"
TEMP_DIR = Path("/tmp/ifh_video_build")

TEMP_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
DOCS_VIDEO_DIR.mkdir(parents=True, exist_ok=True)

# Fonts
FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if os.path.exists("/System/Library/Fonts/Supplemental/Arial Bold.ttf") else FONT_REGULAR

def get_font(size, bold=False):
    path = FONT_BOLD if bold else FONT_REGULAR
    try:
        return ImageFont.truetype(path, size)
    except:
        return ImageFont.load_default()

def draw_gradient(draw, w, h, top_color, bottom_color):
    r1, g1, b1 = top_color
    r2, g2, b2 = bottom_color
    for y in range(h):
        ratio = y / h
        r = int(r1 * (1 - ratio) + r2 * ratio)
        g = int(g1 * (1 - ratio) + g2 * ratio)
        b = int(b1 * (1 - ratio) + b2 * ratio)
        draw.line([(0, y), (w, y)], fill=(r, g, b))

def draw_icon(draw, icon_type, cx, cy, r=18, color=(34, 197, 94)):
    """Draw clean vector icons on PIL canvas"""
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    
    if icon_type == "check":
        # White checkmark
        draw.line([(cx - 7, cy), (cx - 2, cy + 6)], fill=(255, 255, 255), width=3)
        draw.line([(cx - 2, cy + 6), (cx + 8, cy - 6)], fill=(255, 255, 255), width=3)
    elif icon_type == "cross":
        # White X
        draw.line([(cx - 6, cy - 6), (cx + 6, cy + 6)], fill=(255, 255, 255), width=3)
        draw.line([(cx - 6, cy + 6), (cx + 6, cy - 6)], fill=(255, 255, 255), width=3)
    elif icon_type == "alert":
        # Exclamation
        draw.line([(cx, cy - 8), (cx, cy + 2)], fill=(255, 255, 255), width=3)
        draw.ellipse([cx - 2, cy + 5, cx + 2, cy + 9], fill=(255, 255, 255))
    elif icon_type == "shield":
        # Shield outline
        draw.polygon([(cx, cy - 8), (cx + 8, cy - 4), (cx + 6, cy + 6), (cx, cy + 10), (cx - 6, cy + 6), (cx - 8, cy - 4)], fill=(255, 255, 255))
    elif icon_type == "star":
        # Simple star diamond
        draw.polygon([(cx, cy - 9), (cx + 3, cy - 3), (cx + 9, cy), (cx + 3, cy + 3), (cx, cy + 9), (cx - 3, cy + 3), (cx - 9, cy), (cx - 3, cy - 3)], fill=(255, 255, 255))
    elif icon_type == "arrow":
        draw.polygon([(cx + 6, cy), (cx - 4, cy - 6), (cx - 4, cy + 6)], fill=(255, 255, 255))
    elif icon_type == "number":
        pass

def render_phone_mockup(screenshot_path, target_h=750):
    """Render a modern smartphone bezel embedding the app screenshot"""
    phone_w = int(target_h * 0.49)
    phone_h = target_h
    phone_img = Image.new("RGBA", (phone_w + 40, phone_h + 40), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(phone_img)

    # Outer soft glow/shadow
    for offset in range(16, 0, -3):
        alpha = int(35 * (1 - offset / 16))
        pdraw.rounded_rectangle(
            [20 - offset, 20 - offset, phone_w + 20 + offset, phone_h + 20 + offset],
            radius=46 + offset,
            fill=(0, 0, 0, alpha)
        )

    # Phone outer frame
    pdraw.rounded_rectangle([20, 20, phone_w + 20, phone_h + 20], radius=44, fill=(24, 28, 36), outline=(65, 75, 90), width=3)
    
    # Phone inner screen bezel
    screen_rect = [20 + 8, 20 + 8, phone_w + 20 - 8, phone_h + 20 - 8]
    pdraw.rounded_rectangle(screen_rect, radius=36, fill=(0, 0, 0))

    # Embed screenshot
    if os.path.exists(screenshot_path):
        sc = Image.open(screenshot_path).convert("RGBA")
        sw = screen_rect[2] - screen_rect[0]
        sh = screen_rect[3] - screen_rect[1]
        sc_resized = sc.resize((sw, sh), Image.Resampling.LANCZOS)
        
        mask = Image.new("L", (sw, sh), 0)
        mdraw = ImageDraw.Draw(mask)
        mdraw.rounded_rectangle([0, 0, sw, sh], radius=34, fill=255)
        
        phone_img.paste(sc_resized, (screen_rect[0], screen_rect[1]), mask)

    # Camera notch / Dynamic island
    cam_w, cam_h = 75, 18
    cam_x = 20 + (phone_w - cam_w) // 2
    cam_y = 20 + 16
    pdraw.rounded_rectangle([cam_x, cam_y, cam_x + cam_w, cam_y + cam_h], radius=9, fill=(12, 12, 16))

    return phone_img

def render_scene_frame(scene_data, scene_index, total_scenes):
    img = Image.new("RGB", (W, H), (10, 16, 26))
    draw = ImageDraw.Draw(img)

    # 1. Background Gradient (Dark, sleek, elegant)
    top_c = scene_data.get("bg_top", (10, 18, 30))
    bot_c = scene_data.get("bg_bot", (14, 26, 42))
    draw_gradient(draw, W, H, top_c, bot_c)

    # Subtle ambient radial glow on the left and right
    glow_overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow_overlay)
    accent = scene_data.get("accent_color", (34, 197, 94))
    gdraw.ellipse([100, 100, 700, 700], fill=(accent[0], accent[1], accent[2], 18))
    gdraw.ellipse([1200, 200, 1800, 800], fill=(accent[0], accent[1], accent[2], 14))
    img.paste(Image.alpha_composite(img.convert("RGBA"), glow_overlay).convert("RGB"), (0, 0))
    draw = ImageDraw.Draw(img)

    # 2. Top Header Bar
    draw.rounded_rectangle([70, 36, 1850, 100], radius=16, fill=(16, 24, 38), outline=(42, 56, 80), width=1)
    
    # App Logo & Branding
    draw.text((100, 52), "INDIAN FORM HELPER", fill=(255, 255, 255), font=get_font(25, bold=True))
    draw.text((410, 56), "|  Smart Exam Document Toolkit for India", fill=(148, 163, 184), font=get_font(20))

    # Scene Chapter Pill
    chap_text = f"CHAPTER {scene_index + 1} OF {total_scenes} : {scene_data['chapter'].upper()}"
    pill_w = 420
    draw.rounded_rectangle([1850 - pill_w - 20, 48, 1830, 88], radius=12, fill=(28, 44, 78), outline=(70, 110, 200), width=1)
    draw.text((1850 - pill_w, 57), chap_text, fill=(220, 235, 255), font=get_font(16, bold=True))

    # 3. Left Column (Content & Benefit Cards)
    left_x = 80
    curr_y = 130

    # Category Pill
    pill_text = scene_data["tag"].upper()
    pill_color = scene_data.get("accent_color", (34, 197, 94))
    draw.rounded_rectangle([left_x, curr_y, left_x + 350, curr_y + 36], radius=10, fill=(pill_color[0]//6, pill_color[1]//6, pill_color[2]//6), outline=pill_color, width=1)
    draw.text((left_x + 18, curr_y + 8), pill_text, fill=pill_color, font=get_font(16, bold=True))
    curr_y += 50

    # Big Title
    draw.text((left_x, curr_y), scene_data["title"], fill=(255, 255, 255), font=get_font(44, bold=True))
    curr_y += 56

    # Subtitle
    draw.text((left_x, curr_y), scene_data["subtitle"], fill=(156, 172, 196), font=get_font(22))
    curr_y += 44

    # Cards list
    cards = scene_data.get("cards", [])
    card_w = 1010
    card_h = 76 if len(cards) > 3 else 90

    for c in cards:
        card_rect = [left_x, curr_y, left_x + card_w, curr_y + card_h]
        card_bg = (18, 26, 42)
        card_border = (38, 54, 80)
        draw.rounded_rectangle(card_rect, radius=14, fill=card_bg, outline=card_border, width=1)
        
        # Left accent stripe
        c_accent = c.get("color", pill_color)
        draw.rounded_rectangle([left_x, curr_y + 8, left_x + 5, curr_y + card_h - 8], radius=3, fill=c_accent)

        # Draw icon
        icon_type = c.get("icon", "check")
        icon_cx = left_x + 36
        icon_cy = curr_y + card_h // 2
        draw_icon(draw, icon_type, icon_cx, icon_cy, r=16, color=c_accent)

        # Card Title & Description
        draw.text((left_x + 68, curr_y + 14), c["headline"], fill=(255, 255, 255), font=get_font(21, bold=True))
        draw.text((left_x + 68, curr_y + 44), c["desc"], fill=(164, 180, 202), font=get_font(18))
        curr_y += card_h + 12

    # Highlight Benefit Banner
    if "benefit_banner" in scene_data:
        curr_y += 4
        banner_rect = [left_x, curr_y, left_x + card_w, curr_y + 68]
        draw.rounded_rectangle(banner_rect, radius=14, fill=(14, 38, 30), outline=(34, 197, 94), width=2)
        draw_icon(draw, "star", left_x + 32, curr_y + 34, r=15, color=(34, 197, 94))
        draw.text((left_x + 60, curr_y + 12), "KEY BENEFIT FOR ASPIRANTS:", fill=(34, 197, 94), font=get_font(15, bold=True))
        draw.text((left_x + 60, curr_y + 35), scene_data["benefit_banner"], fill=(240, 253, 244), font=get_font(19, bold=True))

    # 4. Right Column: Smartphone Mockup
    phone_path = scene_data.get("screenshot")
    if phone_path and os.path.exists(phone_path):
        phone_img = render_phone_mockup(screenshot_path=phone_path, target_h=750)
        phone_x = 1270
        phone_y = 135
        img.paste(phone_img, (phone_x, phone_y), phone_img)

        # Floating Pill Badge
        badge_txt = scene_data.get("phone_badge")
        if badge_txt:
            bw, bh = 340, 48
            bx = phone_x + 25
            by = phone_y + 675
            draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=14, fill=(12, 26, 44), outline=(56, 189, 248), width=2)
            draw_icon(draw, "shield" if "OFFLINE" in badge_txt else "check", bx + 24, by + 24, r=13, color=(56, 189, 248))
            draw.text((bx + 48, by + 12), badge_txt, fill=(224, 242, 254), font=get_font(18, bold=True))

    # 5. Bottom Subtitle / Hinglish Narration Bar
    draw.rounded_rectangle([70, 960, 1850, 1045], radius=14, fill=(12, 18, 30), outline=(42, 58, 86), width=1)
    draw.text((100, 975), "NARRATION (HINGLISH):", fill=(250, 204, 21), font=get_font(16, bold=True))
    draw.text((100, 1002), f'"{scene_data["subtitle_text"]}"', fill=(255, 255, 255), font=get_font(19))

    return img

SCENES = [
    {
        "chapter": "The Problem",
        "tag": "THE COMMON STRUGGLE",
        "title": "Exam Form Rejection Se Pareshaan?",
        "subtitle": "Deadline 11:59 PM • Thodi si mistake aur portal form reject kar deta hai!",
        "accent_color": (239, 68, 68),
        "bg_top": (28, 12, 16),
        "bg_bot": (18, 14, 24),
        "screenshot": str(WORKSPACE / "docs/screenshots/01-home.png"),
        "phone_badge": "3 Common Portal Errors",
        "cards": [
            {
                "headline": "Photo Size Limit Exceeded",
                "desc": "50 KB limit requirement: 52 KB hote hi portal reject kar deta hai.",
                "color": (239, 68, 68),
                "icon": "cross"
            },
            {
                "headline": "Signature Background Shadow Error",
                "desc": "Dirty gray background aur room shadow se signature portal me fail.",
                "color": (249, 115, 22),
                "icon": "alert"
            },
            {
                "headline": "PDF Marksheet Limit Error",
                "desc": "Scanned document 200 KB / 500 KB limit se badi hone par upload fail.",
                "color": (239, 68, 68),
                "icon": "cross"
            },
            {
                "headline": "Cyber Cafe Loot & 2-Hour Wasted Queue",
                "desc": "Har photo resize ke liye ₹50 se ₹100 kharcha aur dhoop me lambi line.",
                "color": (234, 179, 8),
                "icon": "alert"
            }
        ],
        "benefit_banner": "Ab Cyber Cafe jane aur paise barbad karne ki bilkul zaroorat nahi!",
        "voice_text": "Dosto, agar aapne kabhi SSC, UPSC, Railway ya Banking ka exam form bhara hai, toh aapko pata hoga ki thodi si mistake se form reject ho jata hai, aur cyber cafe me ghanto khade rehkar paise kharch karne padte hain!",
        "subtitle_text": "Dosto, SSC, UPSC ya Railway form me thodi si mistake se rejection hota hai aur cyber cafe me ghanto line lagani padti hai!"
    },
    {
        "chapter": "The Solution",
        "tag": "ALL-IN-ONE SOLUTION",
        "title": "Meet \"Indian Form Helper\"",
        "subtitle": "India Ka Number 1 Smart Exam Document Toolkit",
        "accent_color": (34, 197, 94),
        "bg_top": (8, 24, 20),
        "bg_bot": (10, 30, 26),
        "screenshot": str(WORKSPACE / "docs/screenshots/01-home.png"),
        "phone_badge": "100% OFFLINE & SAFE",
        "cards": [
            {
                "headline": "100% Offline Processing",
                "desc": "Works in Airplane Mode! Document process karne ke liye internet nahi chahiye.",
                "color": (34, 197, 94),
                "icon": "shield"
            },
            {
                "headline": "Zero Cloud Uploads",
                "desc": "Aadhaar card ya marksheet kabhi kisi server par upload nahi hota.",
                "color": (16, 185, 129),
                "icon": "check"
            },
            {
                "headline": "Zero Login Required",
                "desc": "No registration, no password, no OTP. App open karo aur turant use karo!",
                "color": (59, 130, 246),
                "icon": "check"
            },
            {
                "headline": "27+ Powerful Heavy Document Tools",
                "desc": "Photo, signature, PDF compress, merge, split, scanner sab ek sath.",
                "color": (168, 85, 247),
                "icon": "star"
            }
        ],
        "benefit_banner": "100% Data Privacy: Aapka personal data hamesha aapke phone ke andar safe!",
        "voice_text": "Lekin ab tension khatam! Meet Indian Form Helper — India ka smart document toolkit jo banaya gaya hai Indian students ke liye. Aur sabse bada faayda? Yeh 100% OFFLINE kaam karta hai! Aapka Aadhaar ya photo kisi server par upload nahi hota.",
        "subtitle_text": "Meet Indian Form Helper! 100% OFFLINE kaam karta hai — Aapka Aadhaar ya documents kabhi kisi server par upload nahi hote."
    },
    {
        "chapter": "Photo & Signature",
        "tag": "PHOTO & SIGNATURE TOOLS",
        "title": "1-Tap Exam Presets & Signature Magic",
        "subtitle": "Exact pixel & KB lock • No calculations needed",
        "accent_color": (56, 189, 248),
        "bg_top": (8, 20, 34),
        "bg_bot": (12, 28, 44),
        "screenshot": str(WORKSPACE / "docs/screenshots/07-presets.png"),
        "phone_badge": "Magic Signature Cleaner",
        "cards": [
            {
                "headline": "Official Presets: SSC, UPSC, IBPS, Railways",
                "desc": "Dimensions ya ratio calculate karne ki tension nahi, 1 tap me auto set.",
                "color": (56, 189, 248),
                "icon": "check"
            },
            {
                "headline": "Exact File Size Slider",
                "desc": "Photo exact 45 KB me set karein, zero blur aur high clarity ke sath.",
                "color": (34, 197, 94),
                "icon": "check"
            },
            {
                "headline": "Magic Signature Cleaner",
                "desc": "Kagaz ki gandi shadows aur yellow tint ko 1 second me gayab karein.",
                "color": (234, 179, 8),
                "icon": "star"
            },
            {
                "headline": "Pure #FFFFFF White Paper Output",
                "desc": "Portal requirement ke mutabiq pure white background + sharp dark ink!",
                "color": (168, 85, 247),
                "icon": "check"
            }
        ],
        "benefit_banner": "100% Portal Acceptance: Photo aur Signature rejection ki problem permanently solved!",
        "voice_text": "Photo Tools me SSC aur UPSC ke ready-made presets hain—exact pixel aur KB automatic lock! Aur iska Magic Signature Cleaner room shadow hata kar pure white background par sharp dark signature bana deta hai.",
        "subtitle_text": "Photo Tools me SSC & UPSC ready presets hain! Magic Signature Cleaner shadow hata kar pure white paper banata hai."
    },
    {
        "chapter": "PDF Studio",
        "tag": "ULTIMATE PDF STUDIO",
        "title": "Compress, Merge & Sign on Mobile",
        "subtitle": "Heavy PDF tools ab pocket me • No desktop required",
        "accent_color": (168, 85, 247),
        "bg_top": (18, 12, 34),
        "bg_bot": (24, 16, 44),
        "screenshot": str(WORKSPACE / "docs/screenshots/03-pdf-studio.png"),
        "phone_badge": "Compressed by 97%",
        "cards": [
            {
                "headline": "Exact KB PDF Compressor",
                "desc": "10 MB marksheet PDF ko 294 KB me shrink karein — under 300 KB limit!",
                "color": (168, 85, 247),
                "icon": "check"
            },
            {
                "headline": "Zero Blur Text Guarantee",
                "desc": "Compression ke baad bhi roll number aur marks crystal clear dikhte hain.",
                "color": (56, 189, 248),
                "icon": "star"
            },
            {
                "headline": "Merge Marksheets into 1 PDF",
                "desc": "10th marksheet, 12th marksheet aur Aadhaar ko ek single PDF me jodein.",
                "color": (34, 197, 94),
                "icon": "check"
            },
            {
                "headline": "Digital Form Signer",
                "desc": "Bina printer ke undertaking forms par direct mobile screen se sign karein.",
                "color": (234, 179, 8),
                "icon": "check"
            }
        ],
        "benefit_banner": "Printer, Scanner aur Desktop Software ka poora kharcha bacha!",
        "voice_text": "PDF Studio me 10 MB ki file ko bina blur kiye exact 200 ya 500 KB me shrink karein. Multiple marksheets ko ek PDF me merge karein, aur bina printer ke direct phone screen par sign karein!",
        "subtitle_text": "10 MB PDF ko bina blur kiye 294 KB me compress karein, documents merge karein aur mobile screen se direct sign karein!"
    },
    {
        "chapter": "Scanner & OCR",
        "tag": "AI SCANNER & MULTILINGUAL OCR",
        "title": "Smart Scanner & 5 Languages OCR",
        "subtitle": "Physical paper se digital text extraction bina internet",
        "accent_color": (234, 179, 8),
        "bg_top": (26, 20, 8),
        "bg_bot": (34, 26, 10),
        "screenshot": str(WORKSPACE / "docs/screenshots/05-document-scanner.png"),
        "phone_badge": "5 Indian Languages OCR",
        "cards": [
            {
                "headline": "Auto Edge Detection Scanner",
                "desc": "Camera se physical document ke 4 corners automatically snap karein.",
                "color": (234, 179, 8),
                "icon": "check"
            },
            {
                "headline": "Perspective & Glare Removal",
                "desc": "Crooked photo ko flat, clean, scan document me badlein.",
                "color": (34, 197, 94),
                "icon": "check"
            },
            {
                "headline": "Multilingual Indian OCR Support",
                "desc": "English, Hindi, Marathi, Bengali aur Punjabi languages me text pehchanein.",
                "color": (56, 189, 248),
                "icon": "star"
            },
            {
                "headline": "Searchable PDF & Copyable Text",
                "desc": "Printed notification ya gazette se text copy karein 1 tap me!",
                "color": (168, 85, 247),
                "icon": "check"
            }
        ],
        "benefit_banner": "Gazette aur Notifications se text direct copy karein — Typing ka time bacha!",
        "voice_text": "Iska smart scanner document ke corners auto-detect karta hai. Aur iska powerful OCR feature English ke sath-sath Hindi, Marathi, Bengali aur Punjabi me physical paper se text extract kar leta hai!",
        "subtitle_text": "Smart Scanner corners auto-detect karta hai, aur Multilingual OCR 5 Indian languages me text extract karta hai!"
    },
    {
        "chapter": "Benefits Summary",
        "tag": "TOP BENEFITS FOR STUDENTS",
        "title": "Kyun Use Karein Indian Form Helper?",
        "subtitle": "5 Bada Faayda jo aapko kisi aur app me nahi milega",
        "accent_color": (34, 197, 94),
        "bg_top": (8, 24, 24),
        "bg_bot": (12, 34, 30),
        "screenshot": str(WORKSPACE / "docs/screenshots/04-organize-pages.png"),
        "phone_badge": "5-STAR UTILITY",
        "cards": [
            {
                "headline": "1. Zero Form Rejection Guarantee",
                "desc": "Official portal size, ratio & dimensions lock — rejection ka zero risk.",
                "color": (34, 197, 94),
                "icon": "check"
            },
            {
                "headline": "2. 100% Offline & Private (Airplane Mode)",
                "desc": "Zero cloud upload — Aadhaar, photo aur certificates phone me hi safe.",
                "color": (16, 185, 129),
                "icon": "shield"
            },
            {
                "headline": "3. Hazaron Rupaye Ki Bachat",
                "desc": "Cyber cafe aur photo studio ka kharcha 0. Apne mobile se sab kaam karein.",
                "color": (234, 179, 8),
                "icon": "star"
            },
            {
                "headline": "4. 27+ Powerful Heavy Tools",
                "desc": "Resize, compress, merge, split, scanner, OCR, signature aur converter.",
                "color": (56, 189, 248),
                "icon": "check"
            }
        ],
        "benefit_banner": "No Login Needed: Koi sign-up ya password nahi, install karo aur use karo!",
        "voice_text": "Toh benefits simple hain: 1. Zero form rejection ka guarantee. 2. 100% offline data privacy. 3. Cyber cafe ke hazaron rupaye ki bachat. 4. 27 se zyada tools ek jagah. Aur 5. Bina kisi login ke direct use!",
        "subtitle_text": "Top Benefits: Zero Rejection, 100% Offline Privacy, Cyber Cafe Savings, 27+ Heavy Tools, Zero Login Needed!"
    },
    {
        "chapter": "Download Now",
        "tag": "GET STARTED TODAY",
        "title": "Abhi Download Karein!",
        "subtitle": "Sarkari Exam Documents Banayein Ghar Baithe 1 Minute Me",
        "accent_color": (59, 130, 246),
        "bg_top": (10, 18, 36),
        "bg_bot": (14, 24, 48),
        "screenshot": str(WORKSPACE / "docs/screenshots/08-premium.png"),
        "phone_badge": "Free on Google Play",
        "cards": [
            {
                "headline": "Available on Google Play Store",
                "desc": "Search 'Indian Form Helper' on Google Play Store aur install karein.",
                "color": (59, 130, 246),
                "icon": "arrow"
            },
            {
                "headline": "100% Free to Use",
                "desc": "Daily 5 free exports + All 27 tools fully unlocked for every student.",
                "color": (34, 197, 94),
                "icon": "check"
            },
            {
                "headline": "Safe, Verified & Made for India",
                "desc": "Trusted by thousands of SSC, UPSC, and Banking aspirants across India.",
                "color": (234, 179, 8),
                "icon": "star"
            },
            {
                "headline": "All The Best For Your Exams!",
                "desc": "Bina tension ke form bharein aur apni padhai par concentrate karein!",
                "color": (168, 85, 247),
                "icon": "check"
            }
        ],
        "benefit_banner": "Abhi Download Karein aur Apne Friends ke Sath Share Karein!",
        "voice_text": "Toh der kis baat ki? Abhi Google Play Store se download karein Indian Form Helper app, aur apna agla exam form bharein bina kisi tension ke! All the best!",
        "subtitle_text": "Google Play Store se download karein 'Indian Form Helper' aur form bharein bina tension ke. All the best!"
    }
]

def generate_voiceover(scene_idx, text):
    out_aiff = TEMP_DIR / f"voice_{scene_idx}.aiff"
    out_wav = TEMP_DIR / f"voice_{scene_idx}.wav"

    cmd = ["say", "-r", "165", "-v", "Rishi", text, "-o", str(out_aiff)]
    subprocess.run(cmd, check=True)

    filter_graph = "apad=pad_dur=0.5,adelay=300|300,volume=1.35"
    cmd_conv = [
        FFMPEG, "-y", "-i", str(out_aiff),
        "-af", filter_graph,
        "-ar", "44100", "-ac", "2",
        str(out_wav)
    ]
    subprocess.run(cmd_conv, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return out_wav

def get_audio_duration(audio_path):
    cmd = [
        FFPROBE, "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(res.stdout.strip())

def generate_subtle_music(total_duration, output_wav):
    sample_rate = 44100
    n_samples = int(total_duration * sample_rate)
    
    chords = [
        [146.83, 220.00, 261.63, 349.23], # Dm
        [116.54, 174.61, 233.08, 293.66], # Bb
        [174.61, 220.00, 261.63, 349.23], # F
        [130.81, 164.81, 196.00, 261.63]  # C
    ]
    chord_len = 3.0
    
    with wave.open(str(output_wav), "w") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(sample_rate)
        frames = bytearray()
        
        for i in range(n_samples):
            t = i / sample_rate
            chord_idx = int((t / chord_len) % len(chords))
            cur_chord = chords[chord_idx]
            pulse = 0.5 + 0.5 * math.sin(2 * math.pi * 1.5 * t)
            val = sum(math.sin(2 * math.pi * f * t) * (0.8 + 0.2 * math.sin(2 * math.pi * 0.25 * t)) for f in cur_chord)
            val = (val / len(cur_chord)) * 0.045 * pulse
            sample = int(val * 32767)
            sample_clamped = max(-32767, min(32767, sample))
            frames.extend(struct.pack("<hh", sample_clamped, sample_clamped))
            
        f.writeframes(frames)

def build_scene_video(scene_idx, frame_path, voice_wav, duration, out_mp4):
    cmd = [
        FFMPEG, "-y",
        "-loop", "1", "-i", str(frame_path),
        "-i", str(voice_wav),
        "-t", f"{duration:.3f}",
        "-c:v", "libx264", "-tune", "stillimage",
        "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "fast",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        str(out_mp4)
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def main():
    print("=" * 60)
    print("Starting Indian Form Helper Master Explainer Video Production")
    print("=" * 60)

    total_scenes = len(SCENES)
    scene_clips = []
    durations = []

    for idx, sc in enumerate(SCENES):
        print(f"\n[Scene {idx + 1}/{total_scenes}] Processing: {sc['chapter']}...")
        
        frame_img = render_scene_frame(sc, idx, total_scenes)
        frame_path = TEMP_DIR / f"frame_{idx}.png"
        frame_img.save(str(frame_path), format="PNG")
        
        if idx == 1:
            frame_img.save(str(OUTPUT_DIR / "indian_form_helper_thumbnail.png"))
            frame_img.save(str(DOCS_VIDEO_DIR / "indian_form_helper_thumbnail.png"))

        voice_wav = generate_voiceover(idx, sc["voice_text"])
        dur = get_audio_duration(voice_wav)
        durations.append(dur)
        print(f"  -> Audio duration: {dur:.2f}s")

        clip_path = TEMP_DIR / f"scene_{idx}.mp4"
        build_scene_video(idx, frame_path, voice_wav, dur, clip_path)
        scene_clips.append(clip_path)

    total_duration = sum(durations)
    print(f"\nTotal video duration: {total_duration:.2f}s (~{int(total_duration//60)}m {int(total_duration%60)}s)")

    concat_list = TEMP_DIR / "concat_list.txt"
    with open(concat_list, "w") as f:
        for c in scene_clips:
            f.write(f"file '{c}'\n")

    unmixed_mp4 = TEMP_DIR / "unmixed_master.mp4"
    cmd_concat = [
        FFMPEG, "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat_list),
        "-c", "copy",
        str(unmixed_mp4)
    ]
    subprocess.run(cmd_concat, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    bgm_wav = TEMP_DIR / "bgm.wav"
    generate_subtle_music(total_duration + 2.0, bgm_wav)

    final_master_mp4 = OUTPUT_DIR / "indian_form_helper_explainer_hinglish.mp4"
    docs_master_mp4 = DOCS_VIDEO_DIR / "indian_form_helper_explainer_hinglish.mp4"

    cmd_mix = [
        FFMPEG, "-y",
        "-i", str(unmixed_mp4),
        "-i", str(bgm_wav),
        "-filter_complex",
        "[0:a][1:a]amix=inputs=2:duration=first:weights=1.0 0.18[aout]",
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        str(final_master_mp4)
    ]
    subprocess.run(cmd_mix, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    subprocess.run(["cp", str(final_master_mp4), str(docs_master_mp4)], check=True)

    print("\n" + "=" * 60)
    print("SUCCESS! Video Production Complete!")
    print(f"Master Video File: {final_master_mp4}")
    print(f"Master Video Size: {os.path.getsize(final_master_mp4) / (1024*1024):.2f} MB")
    print("=" * 60)

if __name__ == "__main__":
    main()
