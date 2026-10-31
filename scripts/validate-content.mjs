import { readContent, checkContent } from './lib/content.mjs';
import { collectImagePaths } from '../shared/schema.js';

try {
  const content = readContent();
  const errors = checkContent(content);
  if (errors.length) {
    console.error('Контент не прошёл проверку:\n' + errors.map((e) => '  - ' + e).join('\n'));
    process.exit(1);
  }
  const works = content.sections.reduce((n, s) => n + s.works.length, 0);
  console.log(`Контент корректен: разделов ${content.sections.length}, работ ${works}, картинок ${collectImagePaths(content).length}, позиций прайса ${content.price.items.length}.`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
