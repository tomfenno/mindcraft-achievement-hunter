import json, glob

for f in glob.glob('node_modules/minecraft-data/minecraft-data/data/pc/1.21*/protocol.json'):
    with open(f) as fh:
        p = json.load(fh)
    types = p.get('play', {}).get('toServer', {}).get('types', {})
    msg = types.get('packet_chat_message')
    if not msg:
        continue
    changed = False
    for field in msg[1]:
        if field.get('name') == 'checksum' and field.get('type') == 'i8':
            field['type'] = 'u8'
            changed = True
    if changed:
        with open(f, 'w') as fh:
            json.dump(p, fh)
        print('Patched', f)
