import json
import re
import shutil
from datetime import datetime
from pathlib import Path

from docx import Document
from PIL import Image, ImageOps


DOWNLOADS = Path.home() / "Downloads"
PROJECT = Path(__file__).resolve().parents[1]
OUTPUT_DATA = PROJECT / "miniprogram" / "data" / "imported-archives.js"
OUTPUT_IMAGES = PROJECT / "miniprogram" / "images" / "archives"

DOCUMENTS = [
    ("member", "会员发展", "会员发展记录25-12-8更新.docx"),
    ("publicity", "新闻宣传", "宣传记录档案25-4-1更新.docx"),
    ("care", "狮友关爱", "远航+关爱记录2025-4-1更新.docx"),
    ("service", "公益服务", "远航二副服务记事本25-10-7更新.docx"),
    ("plan", "年度服务计划", "远航服务队25-26全年服务计划.docx"),
    ("training", "领导力与培训", "远航领导力发展与培训记事本25-2-24更新.docx"),
    ("social", "聚会联谊", "远航联谊记录2025-4-1.docx"),
]

CATEGORY_ROLES = {
    "member": "会员发展主席",
    "publicity": "新闻宣传主席",
    "care": "关爱主席",
    "service": "服务主席",
    "plan": "服务主席",
    "training": "培训主席",
    "social": "联谊主席",
}

CHINESE_NUMBER = "一二三四五六七八九十百"
SURNAME_LETTERS = {
    "安": "A", "白": "B", "陈": "C", "崔": "C", "丁": "D", "董": "D",
    "付": "F", "冯": "F", "高": "G", "郭": "G", "关": "G", "韩": "H",
    "何": "H", "胡": "H", "黄": "H", "荆": "J", "景": "J", "姜": "J",
    "孔": "K", "李": "L", "刘": "L", "吕": "L", "梁": "L", "林": "L",
    "米": "M", "马": "M", "潘": "P", "彭": "P", "任": "R", "宋": "S",
    "孙": "S", "滕": "T", "田": "T", "王": "W", "吴": "W", "徐": "X",
    "许": "X", "谢": "X", "杨": "Y", "姚": "Y", "张": "Z", "赵": "Z",
    "周": "Z", "郑": "Z",
}


def clean_text(text):
    text = re.sub(r"\s+", " ", text or "").strip()
    return text.replace("\u3000", " ")


def locate_document(filename):
    exact = DOWNLOADS / filename
    if exact.exists():
        return exact
    stem = filename.replace(".docx", "")
    candidates = list(DOWNLOADS.glob("*.docx"))
    for path in candidates:
        if stem[:4] in path.stem and stem[-5:] in path.stem:
            return path
    raise FileNotFoundError(filename)


def paragraph_images(document, paragraph):
    images = []
    for blip in paragraph._p.xpath(".//a:blip"):
        rel_id = blip.get(
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"
        )
        if not rel_id or rel_id not in document.part.rels:
            continue
        part = document.part.rels[rel_id].target_part
        images.append((str(part.partname), part.blob))
    return images


def iter_blocks(document):
    for index, paragraph in enumerate(document.paragraphs):
        yield {
            "index": index,
            "text": clean_text(paragraph.text),
            "images": paragraph_images(document, paragraph),
        }


def is_heading(category, text):
    if not text:
        return False
    if category == "member":
        return bool(
            re.search(r"(20\d{2}\s*年\s*)?\d{1,2}\s*月\s*\d{1,2}\s*日", text)
            and ("加入远航服务队" in text or "召集小组成立" in text)
        )
    if category == "training":
        return bool(re.match(rf"^[{CHINESE_NUMBER}]+\s*[、，,]\s*远航第.+次培训", text))
    if category == "service":
        return bool(
            re.match(rf"^[{CHINESE_NUMBER}]+\s*[、，,]\s*远航.*第.+次服务", text)
            or re.match(rf"^[{CHINESE_NUMBER}]+\s*[、，,]\s*远航服务队", text)
        )
    if category == "care":
        return bool(
            re.search(r"第[一二三四五六七八九十百\d]+次.*(?:关爱|生日)", text)
            and ("时间" not in text)
        )
    if category == "social":
        return bool(
            re.search(r"\d{1,2}\s*月\s*\d{1,2}\s*日?.*第[一二三四五六七八九十百\d]+次联谊", text)
        )
    if category == "publicity":
        return bool(re.match(r"^\d{1,2}\s*月\s*\d{1,2}日?", text))
    return False


def starts_with_date(text):
    normalized = text.strip()
    return bool(
        re.match(r"^(?:20\d{2}\s*年\s*)?\d{1,2}\s*月\s*\d{1,2}\s*(?:日|号)?", normalized)
        or re.match(r"^五月\s*6\s*号", normalized)
    )


def event_start_positions(category, blocks):
    formal = [
        index for index, block in enumerate(blocks)
        if is_heading(category, block["text"])
    ]
    if category not in ("service", "care", "social"):
        return formal

    starts = list(formal)
    for index, block in enumerate(blocks):
        text = block["text"]
        if not text or not starts_with_date(text) or len(text) > 150:
            continue
        if category == "social":
            starts.append(index)
            continue
        prior_formal = [position for position in formal if position < index]
        distance = index - prior_formal[-1] if prior_formal else 999
        if distance <= 4:
            continue
        if category == "service" and not any(
            word in text for word in (
                "服务", "调研", "捐赠", "助学", "行动", "慰问",
                "社区", "自然", "烈士", "垃圾桶", "贫困", "路灯",
            )
        ):
            continue
        starts.append(index)
    return sorted(set(starts))


def split_standard_events(category, blocks):
    starts = event_start_positions(category, blocks)
    events = []
    for position, start in enumerate(starts):
        end = starts[position + 1] if position + 1 < len(starts) else len(blocks)
        chunk = blocks[start:end]
        texts = [block["text"] for block in chunk if block["text"]]
        images = [
            image for block in chunk for image in block["images"]
            if image_is_photo(image[1])
        ]
        if not texts:
            continue
        heading = texts[0]
        formal_heading = is_heading(category, heading)
        if category in ("training", "service") and formal_heading and len(texts) > 1:
            title_source = texts[1]
        else:
            title_source = heading
        events.append({
            "heading": heading,
            "title_source": title_source,
            "texts": texts,
            "images": images,
        })
    return events


def split_plan_events(blocks):
    events = []
    current_owner = ""
    for block in blocks:
        text = block["text"]
        if not text:
            continue
        owner_match = re.search(r"执行主席\s*([\u4e00-\u9fa5]{1,5})", text)
        if owner_match:
            current_owner = owner_match.group(1)
            continue
        if not re.search(r"\d{1,2}\s*月", text):
            continue
        parts = [
            clean_text(part) for part in re.split(
                r"(?=\S{2,18}\s*\d{1,2}\s*月(?:\s*\d{1,2})?)", text
            ) if clean_text(part)
        ]
        if not parts:
            parts = [text]
        for part in parts:
            if len(part) < 4:
                continue
            events.append({
                "heading": part,
                "title_source": part,
                "texts": [f"执行主席：{current_owner}", part] if current_owner else [part],
                "images": [],
            })
    return events


def image_is_photo(blob):
    try:
        from io import BytesIO
        with Image.open(BytesIO(blob)) as image:
            width, height = image.size
            return width >= 180 and height >= 120
    except Exception:
        return False


def infer_date(text, category, event_index):
    normalized = text.replace(" ", "")
    full = re.search(r"(20\d{2})年(\d{1,2})月(\d{1,2})日?", normalized)
    if full:
        return f"{full.group(1)}-{int(full.group(2)):02d}-{int(full.group(3)):02d}"
    short = re.search(r"(\d{1,2})月(\d{1,2})日?", normalized)
    if short:
        month = int(short.group(1))
        day = int(short.group(2))
        year = 2025
        if category in ("service", "training", "member") and month >= 11 and event_index < 5:
            year = 2024
        return f"{year}-{month:02d}-{day:02d}"
    month_only = re.search(r"(\d{1,2})月份?", normalized)
    if month_only:
        month = int(month_only.group(1))
        year = 2025 if month >= 7 else 2026
        return f"{year}-{month:02d}-01"
    return "2025-01-01"


def make_title(category, title_source, texts):
    title = clean_text(title_source)
    title = re.sub(rf"^[{CHINESE_NUMBER}]+[、，,]\s*", "", title)
    title = re.sub(r"^(20\d{2}\s*年\s*)?\d{1,2}\s*月\s*\d{1,2}\s*日[，,\s]*", "", title)
    title = re.sub(r"^\d{1,2}\s*月\s*\d{1,2}日?[，,\s]*", "", title)
    if category == "member":
        if "召集小组成立" in title_source:
            return "远航服务队召集小组成立"
        match = re.search(r"([\u4e00-\u9fa5·]{2,5})狮[兄姐友]?.*加入远航服务队", title_source)
        if match:
            return f"{match.group(1)}加入远航服务队"
    if category == "publicity" and len(texts) > 1 and len(texts[1]) <= 40:
        return texts[1]
    title = re.sub(r"^远航(?:服务队)?第[一二三四五六七八九十百\d]+次", "", title)
    title = title.strip("，,。 -—")
    return title[:60] or f"{category}事件记录"


def extract_keywords(title, category):
    words = [category]
    for keyword in [
        "助学", "敬老", "义剪", "自闭症", "生日", "联谊", "培训", "捐赠",
        "环卫工人", "关爱", "宣传", "会员", "服务", "红色行动", "圆梦",
    ]:
        if keyword in title and keyword not in words:
            words.append(keyword)
    return words[:4]


def save_image(blob, event_id, image_index):
    from io import BytesIO
    event_dir = OUTPUT_IMAGES / event_id
    event_dir.mkdir(parents=True, exist_ok=True)
    output = event_dir / f"{image_index:02d}.jpg"
    with Image.open(BytesIO(blob)) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        image.thumbnail((300, 300), Image.Resampling.LANCZOS)
        image.save(output, "JPEG", quality=38, optimize=True, progressive=True)
    return f"/images/archives/{event_id}/{output.name}"


def redact_sensitive_content(text):
    return re.sub(r"(?<!\d)1[3-9]\d{9}(?!\d)", "手机号仅管理员可见", text)


def parse_member(texts, event_id):
    joined = "\n".join(texts)
    name = ""
    name_match = re.search(r"狮友姓名\s*[:：]\s*([\u4e00-\u9fa5·]{2,5})", joined)
    if not name_match:
        name_match = re.search(r"([\u4e00-\u9fa5·]{2,5})狮[兄姐友]?.*加入远航服务队", texts[0])
    if name_match:
        name = name_match.group(1)
    phone_match = re.search(r"联系电话\s*[:：]\s*(1[3-9]\d{9})", joined)
    company_match = re.search(
        r"企业名称\s*[:：]\s*(.+?)(?=主营项目|企业地址|联系电话|$)", joined.replace("\n", " ")
    )
    business_match = re.search(
        r"主营项目\s*[:：]\s*(.+?)(?=企业地址|联系电话|$)", joined.replace("\n", " ")
    )
    address_match = re.search(
        r"企业地址\s*[:：]\s*(.+?)(?=联系电话|$)", joined.replace("\n", " ")
    )
    if not name:
        return None
    return {
        "_id": f"member-{event_id}",
        "name": name,
        "letter": SURNAME_LETTERS.get(name[:1], "#"),
        "team": "远航服务队",
        "teamId": "yuanhang",
        "position": "狮友",
        "company": clean_text(company_match.group(1)) if company_match else "企业信息待补充",
        "industry": clean_text(business_match.group(1)) if business_match else "行业待补充",
        "resource": clean_text(business_match.group(1)) if business_match else "资源待补充",
        "companyAddress": clean_text(address_match.group(1)) if address_match else "",
        "phone": phone_match.group(1) if phone_match else "",
        "initial": name[:1],
        "avatarTone": "blue",
    }


def parse_founders(texts, event_id):
    members = []
    for index, text in enumerate(texts[1:], start=1):
        match = re.match(r"([\u4e00-\u9fa5·]{2,5})\s*[，,]\s*(.+?)[。.]?$", text)
        if not match:
            continue
        name, company = match.groups()
        if len(name) > 4 or any(word in name for word in ("服务队", "小组")):
            continue
        members.append({
            "_id": f"member-{event_id}-{index}",
            "name": name,
            "letter": SURNAME_LETTERS.get(name[:1], "#"),
            "team": "远航服务队",
            "teamId": "yuanhang",
            "position": "创队成员",
            "company": clean_text(company),
            "industry": "行业待补充",
            "resource": "资源待补充",
            "companyAddress": "",
            "phone": "",
            "initial": name[:1],
            "avatarTone": "gold",
        })
    return members


def main():
    if OUTPUT_IMAGES.exists():
        shutil.rmtree(OUTPUT_IMAGES)
    OUTPUT_IMAGES.mkdir(parents=True, exist_ok=True)

    archive_entries = []
    imported_members = []
    source_stats = []

    for category, category_name, filename in DOCUMENTS:
        path = locate_document(filename)
        document = Document(path)
        blocks = list(iter_blocks(document))
        raw_events = (
            split_plan_events(blocks)
            if category == "plan"
            else split_standard_events(category, blocks)
        )
        source_image_count = 0
        for event_index, raw in enumerate(raw_events, start=1):
            event_id = f"word-{category}-{event_index:03d}"
            date = infer_date(" ".join(raw["texts"][:3]), category, event_index)
            title = make_title(category, raw["title_source"], raw["texts"])
            photo_paths = []
            for image_index, (_, blob) in enumerate(raw["images"], start=1):
                try:
                    photo_paths.append(save_image(blob, event_id, image_index))
                except Exception as error:
                    print(f"image skipped {event_id}-{image_index}: {error}")
            source_image_count += len(photo_paths)
            content = "\n".join(redact_sensitive_content(text) for text in raw["texts"])
            summary_source = next(
                (text for text in raw["texts"][1:] if len(text) >= 12),
                raw["texts"][0],
            )
            entry = {
                "_id": event_id,
                "organizationId": "yuanhang",
                "categoryId": category,
                "date": date,
                "dateLabel": date.replace("-", "年", 1).replace("-", "月", 1) + "日",
                "title": title,
                "team": "远航服务队",
                "uploadedBy": CATEGORY_ROLES[category],
                "uploaderRole": category_name,
                "status": "published",
                "photoCount": len(photo_paths),
                "photos": photo_paths,
                "tone": {
                    "member": "blue", "publicity": "gold", "care": "red",
                    "service": "green", "plan": "teal",
                    "training": "purple", "social": "gold",
                }[category],
                "keywords": extract_keywords(title, category_name),
                "summary": redact_sensitive_content(clean_text(summary_source))[:180],
                "content": content,
                "sourceDocument": filename,
            }
            archive_entries.append(entry)
            if category == "member":
                if "召集小组成立" in raw["heading"]:
                    imported_members.extend(parse_founders(raw["texts"], event_id))
                member = parse_member(raw["texts"], event_id)
                if member:
                    member["avatarUrl"] = photo_paths[0] if photo_paths else ""
                    imported_members.append(member)
        deduped_members = {}
        for member in imported_members:
            deduped_members[member["name"]] = member
        imported_members = list(deduped_members.values())
        source_stats.append({
            "category": category,
            "document": filename,
            "events": len(raw_events),
            "photos": source_image_count,
        })

    payload = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "archiveEntries": archive_entries,
        "members": imported_members,
        "sourceStats": source_stats,
    }
    OUTPUT_DATA.write_text(
        "module.exports = " + json.dumps(
            payload, ensure_ascii=False, separators=(",", ":")
        ) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "data": str(OUTPUT_DATA),
        "events": len(archive_entries),
        "members": len(imported_members),
        "photos": sum(len(item["photos"]) for item in archive_entries),
        "stats": source_stats,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
