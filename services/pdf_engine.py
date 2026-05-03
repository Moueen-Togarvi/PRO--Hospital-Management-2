"""
PDF Billing Engine — PRO System v2.0
Uses Puppeteer (via pyppeteer) for high-fidelity CSS-to-PDF rendering.
"""
import os
import io
import base64
import logging
import asyncio
from datetime import datetime
from jinja2 import Environment, FileSystemLoader, select_autoescape

logger = logging.getLogger(__name__)

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), '..', 'templates')

async def _render_with_puppeteer(html_content: str) -> bytes:
    """Uses pyppeteer to render HTML to a professional PDF."""
    from pyppeteer import launch
    
    # Launch browser (no-sandbox is often required in server environments)
    browser = await launch(
        headless=True,
        args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    )
    try:
        page = await browser.newPage()
        
        # Set content and wait for network idle to ensure all styles/assets load
        await page.setContent(html_content, waitUntil='networkidle0')
        
        # Generate PDF with professional settings
        pdf_bytes = await page.pdf({
            'format': 'A4',
            'printBackground': True,
            'margin': {
                'top': '20mm',
                'bottom': '20mm',
                'left': '10mm',
                'right': '10mm'
            }
        })
        return pdf_bytes
    finally:
        await browser.close()

def _generate_qr_base64(data: str) -> str:
    """Generate a QR code PNG and return as base64 string for inline embedding."""
    try:
        import qrcode
        from PIL import Image
        qr = qrcode.QRCode(version=1, box_size=6, border=2)
        qr.add_data(data)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#1a3c5e", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return base64.b64encode(buf.getvalue()).decode('utf-8')
    except Exception as e:
        logger.warning(f"[PDF] QR code generation failed: {e}")
        return ""

def generate_billing_pdf(patient: dict, financial: dict) -> tuple[bytes | None, str | None]:
    """
    Generate a professional billing PDF for a patient using Puppeteer.
    """
    try:
        env = Environment(
            loader=FileSystemLoader(TEMPLATE_DIR),
            autoescape=select_autoescape(['html'])
        )
        template = env.get_template('billing_template.html')

        # Build QR payload
        qr_data = (
            f"PRO-BILL|{patient.get('_id', 'N/A')}|"
            f"{financial.get('month_year', '')}|"
            f"PKR{financial.get('total_charges', 0)}"
        )
        qr_b64 = _generate_qr_base64(qr_data)

        context = {
            "patient": patient,
            "financial": financial,
            "qr_b64": qr_b64,
            "generated_at": datetime.now().strftime('%d %B %Y, %I:%M %p'),
            "currency": "PKR",
        }

        html_content = template.render(**context)

        # Run Puppeteer (pyppeteer) in an event loop
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            pdf_bytes = loop.run_until_complete(_render_with_puppeteer(html_content))
            loop.close()
            
            logger.info(f"[PDF] Generated billing PDF via Puppeteer for {patient.get('name')} ({len(pdf_bytes)} bytes)")
            return pdf_bytes, None
        except Exception as pe:
            logger.error(f"[PDF] Puppeteer rendering failed: {pe}")
            # Final fallback: return HTML bytes if PDF generation fails completely
            return html_content.encode('utf-8'), f"Puppeteer error: {pe}"

    except Exception as e:
        logger.error(f"[PDF] Template rendering failed: {e}")
        return None, str(e)

def generate_daily_report_pdf(patient: dict, reports: list) -> tuple[bytes | None, str | None]:
    """
    Generate a PDF summary of daily reports using Puppeteer.
    """
    try:
        # Re-use logic with reports template
        # (Assuming reports use a similar layout or inline template)
        from jinja2 import Template
        
        # Simple report template for now
        template_str = """
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; }
  .header { background: #1a3c5e; color: white; padding: 30px; text-align: center; border-radius: 0 0 20px 20px; }
  .container { padding: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th { background: #f4f4f4; padding: 12px; text-align: left; border-bottom: 2px solid #1a3c5e; }
  td { padding: 12px; border-bottom: 1px solid #eee; }
  .mood-badge { padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 0.8em; }
</style>
</head>
<body>
  <div class="header">
    <h1>Pakistan Recovery Oasis</h1>
    <p>Daily Progress Summary: {{ patient.name }}</p>
  </div>
  <div class="container">
    <p><strong>Report Generated:</strong> {{ generated_at }}</p>
    <table>
      <thead>
        <tr><th>Date</th><th>Mood</th><th>Vitals</th><th>Diet</th><th>Notes</th></tr>
      </thead>
      <tbody>
        {% for r in reports %}
        <tr>
          <td>{{ r.date[:10] if r.date else 'N/A' }}</td>
          <td><span class="mood-badge">{{ r.mood or 'N/A' }}</span></td>
          <td>{{ r.vitals or 'N/A' }}</td>
          <td>{{ r.diet_status or 'N/A' }}</td>
          <td>{{ r.notes or '' }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
  </div>
</body>
</html>
"""
        html = Template(template_str).render(
            patient=patient,
            reports=reports,
            generated_at=datetime.now().strftime('%d %B %Y, %I:%M %p')
        )

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        pdf_bytes = loop.run_until_complete(_render_with_puppeteer(html))
        loop.close()
        return pdf_bytes, None

    except Exception as e:
        logger.error(f"[PDF] Daily report PDF failed: {e}")
        return None, str(e)
