with open('frontend/src/app/(dashboard)/settings/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_type = "platform: 'instagram' | 'facebook' | 'linkedin'"
new_type = "platform: 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'twitter' | string"
content = content.replace(old_type, new_type)

with open('frontend/src/app/(dashboard)/settings/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated SocialAccountItem platform type!')

