#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'apps/api/src/modules/routers/router-overview.service.ts'
text = PATH.read_text(encoding='utf-8')

bad_select = """            portalWalledGardenHosts: true,
            ttlAntiTetheringEnabled: router.ttlAntiTetheringEnabled,
"""
good_select = """            portalWalledGardenHosts: true,
            ttlAntiTetheringEnabled: true,
"""
if bad_select in text:
    text = text.replace(bad_select, good_select, 1)
elif good_select not in text:
    raise RuntimeError('Router overview select block is missing ttlAntiTetheringEnabled')

bad_map = """      portalWalledGardenHosts: router.portalWalledGardenHosts ?? [],
      ttlAntiTetheringEnabled: true,
"""
good_map = """      portalWalledGardenHosts: router.portalWalledGardenHosts ?? [],
      ttlAntiTetheringEnabled: router.ttlAntiTetheringEnabled,
"""
if bad_map in text:
    text = text.replace(bad_map, good_map, 1)
elif good_map not in text:
    raise RuntimeError('Router overview map block is missing ttlAntiTetheringEnabled')

PATH.write_text(text, encoding='utf-8')
print('Router overview mapping repaired: Prisma select remains boolean true; mapped response exposes the router value.')
