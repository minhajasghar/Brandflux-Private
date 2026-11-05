import os
import sys
from datetime import datetime, timedelta

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, backend_dir)

from database import SessionLocal
from models.models import SocialAccount, PublishAttempt

db = SessionLocal()
now = datetime.utcnow()

platforms_config = {
    'facebook': {
        'name': 'Facebook Page',
        'is_configured': bool(os.getenv('META_APP_ID') and os.getenv('META_APP_SECRET')),
    },
    'instagram': {
        'name': 'Instagram Business',
        'is_configured': bool(os.getenv('META_APP_ID') and os.getenv('META_APP_SECRET')),
    },
    'linkedin': {
        'name': 'LinkedIn',
        'is_configured': bool(os.getenv('LINKEDIN_CLIENT_ID') and os.getenv('LINKEDIN_CLIENT_SECRET')),
    },
    'tiktok': {
        'name': 'TikTok',
        'is_configured': bool(os.getenv('TIKTOK_CLIENT_KEY') and os.getenv('TIKTOK_CLIENT_SECRET')),
    },
    'twitter': {
        'name': 'X (Twitter)',
        'is_configured': bool(os.getenv('TWITTER_CLIENT_ID') and os.getenv('TWITTER_CLIENT_SECRET')),
    }
}

for plat, info in platforms_config.items():
    print(f"PLATFORM: {info['name']} | Configured: {info['is_configured']}")
    
    # Query accounts
    accounts = db.query(SocialAccount).filter(SocialAccount.platform == plat, SocialAccount.is_active == True).all()
    print(f"  Active accounts: {len(accounts)}")
    for a in accounts:
        print(f"    - {a.account_name} ({a.account_id}) | Expires: {a.token_expires_at}")
    
    # Token health
    health = 'NOT_CONNECTED'
    if accounts:
        expired = any(a.token_expires_at and a.token_expires_at < now for a in accounts)
        expiring = any(a.token_expires_at and a.token_expires_at <= now + timedelta(days=7) for a in accounts)
        if expired:
            health = 'EXPIRED'
        elif expiring:
            health = 'EXPIRING_SOON'
        else:
            health = 'HEALTHY'
    print(f"  Token Health: {health}")
    
    # Last success
    last_succ = db.query(PublishAttempt).filter(
        PublishAttempt.platform == plat,
        PublishAttempt.status == 'success'
    ).order_by(PublishAttempt.created_at.desc()).first()
    print(f"  Last Success: {last_succ.created_at if last_succ else None}")
    
    # Last error
    last_err = db.query(PublishAttempt).filter(
        PublishAttempt.platform == plat,
        PublishAttempt.status.in_(['failed', 'needs_reconnect'])
    ).order_by(PublishAttempt.created_at.desc()).first()
    print(f"  Last Error: {last_err.created_at if last_err else None} - {last_err.error_message if last_err else ''}")

db.close()

