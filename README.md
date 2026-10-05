# Objects

Статическая библиотека изображений на Astro: категории, сетка, отдельные страницы
объектов, скачивание оригиналов и светлая/тёмная тема. Адрес сайта:
https://objects.xinger.net.

## Разработка

Нужен Node.js 22.12+; проект проверен на Node.js 24.

```sh
npm ci
npm run dev
```

Сайт доступен на http://127.0.0.1:4321. Изначально каталог пуст.

```sh
npm test
npm run check
npm run build
npm run preview
```

Браузерные проверки запускаются командой `npm run test:ui` и требуют установленного
Google Chrome. Они создают собственный временный каталог внутри игнорируемой
папки `media/`; production-данные остаются неизменными.

## Каталог

`data/categories.json` задаёт названия и порядок категорий:

```json
[
  { "id": "furniture", "title": "Мебель" }
]
```

Для каждой категории нужен `data/categories/<id>.json` с массивом объектов.
Пустая категория содержит `[]`.

```json
[
  {
    "id": "obj_000001",
    "original": "originals/obj_000001.png",
    "preview": "previews/obj_000001.webp",
    "width": 2048,
    "height": 2048,
    "title": "Красный стул",
    "description": "",
    "tags": [],
    "filename": "red-chair.png"
  }
]
```

`title`, `description`, `tags` и `filename` необязательны. Размеры описывают
оригинал; превью должно сохранять его пропорции. ID уникален во всём каталоге
и задаёт постоянный адрес `/object/<id>/`. Категория определяется файлом.
Порядок объектов соответствует порядку записей в массиве; общий каталог
объединяет категории в порядке из `categories.json`.

Ключи `original` и `preview` относятся к R2. Можно также указывать полные
HTTP(S)-адреса. Базовый адрес по умолчанию: https://objects-media.xinger.net/.
Чтобы заменить его, добавьте `PUBLIC_MEDIA_BASE_URL` в локальный `.env` и
в настройки сборки Cloudflare. Эта переменная публичная, секреты в неё не кладутся.

Изображения храните вне Git: локально в `media/`, опубликованные — в R2.
Сначала загрузите оригиналы и превью, затем добавьте JSON и запустите сборку.
Сборка проверяет данные и создаёт страницы по 60 объектов, страницы каждого
объекта, sitemap изображений и robots.txt. Новые данные требуют пересборки.

## Локальный просмотр с временными изображениями

При наличии подготовленного каталога `media/demo-data/` и PNG в
`media/preview-public/media/`:

```sh
CATALOG_DATA_DIR=media/demo-data PUBLIC_MEDIA_BASE_URL=/media/ PREVIEW_PUBLIC_DIR=media/preview-public npm run dev -- --ignore-lock
```

Эти переменные нужны только локальному preview. Обычная production-сборка читает
`data/` и копирует только `public/`, без временных PNG и тестового каталога.

## Cloudflare Pages и R2

Проект Cloudflare Pages: `objects`.
Git integration подключена к `xinger/objects`, production-ветка — `main`.
Push в `main` запускает сборку и публикацию автоматически.
Технический адрес: https://objects-6bn.pages.dev/.

Настройки проекта:

- Build command: `npm run build`.
- Build output directory: `dist`.
- Node.js: `NODE_VERSION=24`.
- Custom domain: `objects.xinger.net`.
- Публичный адрес R2: `objects-media.xinger.net` или выбранный вами адрес через
  `PUBLIC_MEDIA_BASE_URL`.

Для скачивания с другого домена нужен CORS на R2:

```json
[
  {
    "AllowedOrigins": ["https://objects.xinger.net", "http://127.0.0.1:4321"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": [],
    "MaxAgeSeconds": 3600
  }
]
```

Для preview-доменов Pages добавьте нужные origin отдельно. JavaScript загружает
оригинал как Blob и сохраняет его без преобразования. Для скачивания без
JavaScript задайте оригиналам R2 метаданные `Content-Disposition: attachment`;
превью оставьте с обычным отображением. MIME-тип должен соответствовать файлу.

Домен R2 нужно подключить к bucket и настроить кеширование. Используйте
новые ключи при замене изображения, чтобы не показывать старые кешированные файлы.

R2 подключается отдельно при наполнении каталога.

## Инструменты Cloudflare

Официальный CLI Wrangler установлен как локальная зависимость разработки.
Его версия фиксируется в `package-lock.json`.

```sh
npm ci
npm run cf -- --version
npm run cf -- login
npm run cf -- whoami
```

Вход выполняется через браузер. После входа Wrangler позволяет управлять
Cloudflare Pages, Workers, R2 и D1 через терминал. Для проверки доступа к R2:

```sh
npm run cf -- r2 bucket list
```

R2 требует активированной подписки с бесплатным месячным объёмом использования.
Хранилище подключается отдельно от сайта.

Локальные исходники и подготовленные превью можно хранить в `media/`:
эта папка исключена из Git. Файлы `.env`, `.dev.vars` и локальное состояние
Wrangler также исключены из Git.

Документация: https://developers.cloudflare.com/workers/wrangler/

## Превью тяжёлых PNG

Перед загрузкой в R2 создайте WebP локально:

```sh
npm run images:preview -- media/originals media/previews
```

Команда обходит вложенные папки, сохраняет их структуру и меняет расширение
`.png` на `.webp`. По умолчанию результат записывается в `media/previews/`.
Длинная сторона — максимум 1024 px, пропорции и прозрачность сохраняются,
маленькие изображения не увеличиваются. Качество WebP — 82, alpha — 100.
Обрабатываются четыре файла одновременно; исходные PNG остаются без изменений.
Повторный запуск заменяет существующие WebP. Не указывайте чужую папку с WebP
как папку результата.

В JSON поле `preview` указывает на подготовленный WebP, `original` — на PNG.
Оба файла загружаются в R2; конвертация не выполняется в браузере или при
сборке сайта. Изображения из `media/` не попадают в Git и production-сборку.
