import io
import os
import base64
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from PIL import Image as PILImage

def generate_payment_receipt_pdf(payment, bank_details: dict = None) -> bytes:
    """
    Generate an official, branded PDF receipt / proof document for manual bank transfers.
    Returns bytes buffer.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )

    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=22,
        leading=26,
        textColor=colors.HexColor('#2563EB'),
        fontName='Helvetica-Bold'
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#6B7280'),
        fontName='Helvetica'
    )

    header_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#111827'),
        fontName='Helvetica-Bold'
    )

    text_style = ParagraphStyle(
        'StandardText',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#374151'),
        fontName='Helvetica'
    )

    bold_text_style = ParagraphStyle(
        'BoldText',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#111827'),
        fontName='Helvetica-Bold'
    )

    story = []

    # 1. Header with Brandflux title & Receipt metadata
    receipt_no = f"RCP-{payment.id[:8].upper()}"
    date_str = payment.created_at.strftime("%B %d, %Y - %I:%M %p") if payment.created_at else datetime.utcnow().strftime("%B %d, %Y")

    header_data = [
        [
            Paragraph("BRANDFLUX", title_style),
            Paragraph(f"<b>RECEIPT #:</b> {receipt_no}<br/><b>DATE:</b> {date_str}", subtitle_style)
        ],
        [
            Paragraph("Automated Brand Intelligence & Content Engine<br/>by TNT Innovations", subtitle_style),
            Paragraph(f"<b>STATUS:</b> <font color='{'#10B981' if payment.status == 'approved' else '#F59E0B'}'>{payment.status.upper()}</font>", subtitle_style)
        ]
    ]

    header_table = Table(header_data, colWidths=[320, 210])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ALIGN', (1,0), (1,-1), 'RIGHT'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 15))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#2563EB'), spaceAfter=15))

    # 2. Subscriber & Plan Information
    story.append(Paragraph("1. SUBSCRIBER & SUBSCRIPTION DETAILS", header_style))
    story.append(Spacer(1, 8))

    sub_data = [
        [Paragraph("Customer Name:", bold_text_style), Paragraph(payment.user_name or "N/A", text_style)],
        [Paragraph("Customer Email:", bold_text_style), Paragraph(payment.user_email or "N/A", text_style)],
        [Paragraph("Plan Selected:", bold_text_style), Paragraph(f"<b>{payment.plan_id.upper()}</b> Plan ({payment.billing_cycle.capitalize()})", text_style)],
        [Paragraph("Total Amount:", bold_text_style), Paragraph(f"<b>{payment.amount:.2f} {payment.currency}</b>", bold_text_style)],
    ]
    sub_table = Table(sub_data, colWidths=[150, 380])
    sub_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F9FAFB')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#E5E7EB')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E5E7EB')),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(sub_table)
    story.append(Spacer(1, 15))

    # 3. Manual Bank Transfer Details
    story.append(Paragraph("2. BANK TRANSFER PAYMENT PROOF", header_style))
    story.append(Spacer(1, 8))

    proof_data = [
        [Paragraph("Sender Account Name:", bold_text_style), Paragraph(payment.sender_account_name or "N/A", text_style)],
        [Paragraph("Sender Account Number:", bold_text_style), Paragraph(payment.sender_account_number or "N/A", text_style)],
        [Paragraph("Bank Name Used:", bold_text_style), Paragraph(payment.bank_name or "Direct Bank Transfer", text_style)],
        [Paragraph("Transaction ID / Ref:", bold_text_style), Paragraph(payment.transaction_reference or "N/A", bold_text_style)],
        [Paragraph("Verification Status:", bold_text_style), Paragraph(f"<b>{payment.status.upper()}</b>", text_style)],
    ]
    if payment.notes:
        proof_data.append([Paragraph("Customer Notes:", bold_text_style), Paragraph(payment.notes, text_style)])
    if payment.admin_notes:
        proof_data.append([Paragraph("Admin Review Notes:", bold_text_style), Paragraph(payment.admin_notes, text_style)])

    proof_table = Table(proof_data, colWidths=[150, 380])
    proof_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F9FAFB')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#E5E7EB')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E5E7EB')),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(proof_table)
    story.append(Spacer(1, 15))

    # 4. Receiving Bank Account Info
    if bank_details:
        story.append(Paragraph("3. BENEFICIARY BANK DETAILS (TNT INNOVATIONS)", header_style))
        story.append(Spacer(1, 8))
        b_data = [
            [Paragraph("Bank Name:", bold_text_style), Paragraph(bank_details.get("bank_name", "N/A"), text_style)],
            [Paragraph("Account Title:", bold_text_style), Paragraph(bank_details.get("account_title", "N/A"), text_style)],
            [Paragraph("Account Number:", bold_text_style), Paragraph(bank_details.get("account_number", "N/A"), text_style)],
            [Paragraph("IBAN / Swift:", bold_text_style), Paragraph(f"{bank_details.get('iban', '')} / {bank_details.get('swift_code', '')}", text_style)],
        ]
        b_table = Table(b_data, colWidths=[150, 380])
        b_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F3F4F6')),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#D1D5DB')),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E5E7EB')),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(b_table)
        story.append(Spacer(1, 15))

    # 4.5 Embedded Payment Proof Screenshot
    proof_url = getattr(payment, "proof_image_url", None)
    if proof_url and not str(proof_url).startswith("data:application/pdf"):
        try:
            img_bytes = None
            proof_str = str(proof_url).strip()
            if proof_str.startswith("data:image") and ";base64," in proof_str:
                b64_part = proof_str.split(";base64,", 1)[1]
                img_bytes = base64.b64decode(b64_part)
            elif "/api/media/posts/" in proof_str or "/media/posts/" in proof_str:
                fn = proof_str.split("/posts/")[-1].split("?")[0]
                backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                for candidate_path in [
                    os.path.join(backend_dir, "media", "posts", fn),
                    os.path.join("media", "posts", fn),
                    os.path.join("backend", "media", "posts", fn),
                ]:
                    if os.path.exists(candidate_path):
                        with open(candidate_path, "rb") as f:
                            img_bytes = f.read()
                        break
            elif proof_str.startswith(("http://", "https://")):
                import httpx
                with httpx.Client(timeout=10.0) as client:
                    resp = client.get(proof_str)
                    if resp.status_code == 200:
                        img_bytes = resp.content
            else:
                local_rel = proof_str.lstrip("/")
                if local_rel.startswith("api/media/"):
                    local_rel = local_rel.replace("api/media/", "media/", 1)
                if os.path.exists(local_rel):
                    with open(local_rel, "rb") as f:
                        img_bytes = f.read()

            if img_bytes:
                pil_img = PILImage.open(io.BytesIO(img_bytes))
                if pil_img.mode not in ("RGB", "RGBA"):
                    pil_img = pil_img.convert("RGB")
                png_buf = io.BytesIO()
                pil_img.save(png_buf, format="PNG")
                png_buf.seek(0)

                iw, ih = pil_img.size
                max_w, max_h = 460.0, 280.0
                scale = min(max_w / max(iw, 1), max_h / max(ih, 1), 1.0)
                draw_w, draw_h = iw * scale, ih * scale

                story.append(Paragraph("4. UPLOADED PAYMENT SCREENSHOT PROOF", header_style))
                story.append(Spacer(1, 8))
                story.append(RLImage(png_buf, width=draw_w, height=draw_h))
                story.append(Spacer(1, 15))
        except Exception:
            pass

    # 5. Footer Notice
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#D1D5DB'), spaceAfter=10))
    footer_p = Paragraph(
        "This is an official computer-generated receipt from Brandflux (TNT Innovations). "
        "For any billing questions or support inquiries, contact info@tntinnov.com.",
        subtitle_style
    )
    story.append(footer_p)

    doc.build(story)
    buffer.seek(0)
    pdf_bytes = buffer.getvalue()

    # Persist generated PDF to disk under media/receipts/
    try:
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        receipts_dir = os.path.join(backend_dir, "media", "receipts")
        os.makedirs(receipts_dir, exist_ok=True)
        pdf_filename = f"Brandflux_Receipt_{payment.id[:8].upper()}.pdf"
        with open(os.path.join(receipts_dir, pdf_filename), "wb") as pf:
            pf.write(pdf_bytes)
    except Exception:
        pass

    return pdf_bytes

