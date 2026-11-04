import copy
import json
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(r'D:\Job\Поиск работы\SnapBuild')
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
catalog = json.loads((SOURCE / 'source/component-catalog.json').read_text('utf-8'))
descriptions = {
    'Книга': 'Знания, обучение, чтение, исследование, образование',
    'Лампа': 'Идея, вдохновение, открытие, свет, творчество',
    'Пазлы': 'Решение задачи, сотрудничество, связь частей, сборка',
    'Телефон': 'Связь, общение, технологии, приложение, мобильность',
    'Наушники': 'Музыка, звук, внимание, отдых, подкаст',
    'Кошелек': 'Деньги, бюджет, покупки, личные финансы',
    'Ручка': 'Письмо, работа, заметки, творчество, планирование',
    'Папка': 'Порядок, документы, организация, хранение',
    'Монета': 'Стоимость, накопления, доход, инвестиции',
    'unnamed-10': 'Предмет без описания: требуется уточнение'
}
documents = {}
objects = {}
for variant in catalog['variants']:
    source = variant['source']
    if source not in documents:
        documents[source] = ET.parse(SOURCE / source).getroot()
    document = documents[source]
    group = next(node for node in document.iter() if node.get('id') == variant['source_id'])
    svg = ET.Element(f'{{{NS}}}svg', document.attrib)
    svg.append(copy.deepcopy(group))
    for defs in document.findall(f'{{{NS}}}defs'):
        svg.append(copy.deepcopy(defs))
    name = variant['object']
    item = objects.setdefault(name, {
        'id': 'starter-' + str(len(objects) + 1), 'name': name if name != 'unnamed-10' else 'Без названия',
        'description': descriptions[name], 'origin': 'starter', 'variants': []
    })
    item['variants'].append({'detail': variant['detail'], 'role': variant['role'], 'svg': ET.tostring(svg, encoding='unicode')})
out = ROOT / 'src/assets'
out.mkdir(parents=True, exist_ok=True)
(out / 'library.json').write_text(json.dumps(list(objects.values()), ensure_ascii=False), 'utf-8')
palettes = json.loads((SOURCE / 'source/palettes.json').read_text('utf-8'))['palettes']
(out / 'palettes.json').write_text(json.dumps(palettes, ensure_ascii=False), 'utf-8')
print(f'Подготовлено {len(objects)} предметов, {sum(len(o["variants"]) for o in objects.values())} вариантов, {len(palettes)} палитры')
