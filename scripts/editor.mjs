// Запуск локального редактора: npm run edit
import { createEditorServer } from '../editor/server/app.mjs';
import { CONTENT_FILE, ASSETS_DIR } from './lib/paths.mjs';

const port = Number(process.env.PORT) || 4174;
const ed = createEditorServer({ contentFile: CONTENT_FILE, assetsDir: ASSETS_DIR, port });
ed.listen().then((p) => {
  console.log(`Редактор: http://127.0.0.1:${p}/`);
  console.log('Слушает только 127.0.0.1. Остановить: Ctrl+C.');
}).catch((e) => { console.error(e.code === 'EADDRINUSE' ? `Порт ${port} занят. Задайте другой: PORT=4180 npm run edit` : e.message); process.exit(1); });
