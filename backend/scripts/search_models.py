import sys; sys.stdout.reconfigure(encoding='utf-8')
with open('backend/models/models.py', encoding='utf-8') as f:
    text = f.read()

for idx, line in enumerate(text.splitlines(), 1):
    if 'platform_copies' in line or 'PlatformCopy' in line or 'class ParentPost' in line:
        print(f'{idx}: {line[:100]}')

