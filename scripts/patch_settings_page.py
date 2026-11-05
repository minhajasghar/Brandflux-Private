import sys

path = 'frontend/src/app/(dashboard)/settings/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

import_statement = "import AutopilotTab from '@/components/autopilot/AutopilotTab'\n"
if import_statement not in text:
    text = text.replace("import { useState, useEffect, useRef } from 'react'", "import { useState, useEffect, useRef } from 'react'\n" + import_statement, 1)

start_str = "{activeTab === 'autopilot' && ("
end_str = "{activeTab === 'account' && ("

start_idx = text.find(start_str)
end_idx = text.find(end_str)

print("start_idx:", start_idx, "end_idx:", end_idx)

if start_idx != -1 and end_idx != -1:
    sub = text[start_idx:end_idx]
    divider_idx = sub.rfind("{/* ═══")
    if divider_idx != -1:
        new_text = text[:start_idx] + "{activeTab === 'autopilot' && <AutopilotTab />}\n\n          " + text[start_idx + divider_idx:]
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_text)
        print("SUCCESSFULLY REPLACED!")
    else:
        print("Divider not found!")
else:
    print("Indices not found!")
