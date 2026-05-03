"""
PDF Storage Abstraction — PRO System v2.0
Supports local filesystem and AWS S3 backends.
Switch via PDF_STORAGE env var: 'local' (default) | 's3'
"""
import os
import uuid
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

PDF_STORAGE = os.getenv('PDF_STORAGE', 'local')
PDF_LOCAL_DIR = os.path.join(os.path.dirname(__file__), '..', 'generated_pdfs')


def store_pdf(pdf_bytes: bytes, filename: str = None) -> tuple[str, str | None]:
    """
    Store PDF bytes and return (url, error).
    URL is a signed S3 URL (10-min expiry) or a local serve path.
    """
    if not filename:
        filename = f"bill_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}.pdf"

    if PDF_STORAGE == 's3':
        return _store_s3(pdf_bytes, filename)
    return _store_local(pdf_bytes, filename)


def _store_local(pdf_bytes: bytes, filename: str) -> tuple[str, str | None]:
    """Save to local generated_pdfs/ directory and return a serve URL."""
    try:
        os.makedirs(PDF_LOCAL_DIR, exist_ok=True)
        filepath = os.path.join(PDF_LOCAL_DIR, filename)
        with open(filepath, 'wb') as f:
            f.write(pdf_bytes)
        url = f"/api/pdfs/{filename}"
        logger.info(f"[PDF Storage] Saved locally: {filepath}")
        return url, None
    except Exception as e:
        logger.error(f"[PDF Storage] Local save failed: {e}")
        return "", str(e)


def _store_s3(pdf_bytes: bytes, filename: str) -> tuple[str, str | None]:
    """Upload to private S3 bucket and return a 10-minute signed URL."""
    try:
        import boto3
        from botocore.exceptions import BotoCoreError, ClientError

        s3 = boto3.client(
            's3',
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_REGION', 'ap-southeast-1')
        )
        bucket = os.getenv('S3_BUCKET_NAME', 'pro-hospital-pdfs')
        key = f"billing/{filename}"

        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=pdf_bytes,
            ContentType='application/pdf',
            ServerSideEncryption='AES256'  # Encryption at rest
        )

        # Generate 10-minute presigned URL
        url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=600  # 10 minutes
        )
        logger.info(f"[PDF Storage] Uploaded to S3: s3://{bucket}/{key}")
        return url, None

    except ImportError:
        return "", "boto3 not installed"
    except Exception as e:
        logger.error(f"[PDF Storage] S3 upload failed: {e}")
        return "", str(e)


def get_local_pdf_path(filename: str) -> str | None:
    """Return absolute path of a locally stored PDF, or None if not found."""
    path = os.path.join(PDF_LOCAL_DIR, filename)
    return path if os.path.isfile(path) else None
