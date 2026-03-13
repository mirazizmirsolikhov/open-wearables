# Изменения форка

Отличия этого форка от оригинала [the-momentum/open-wearables](https://github.com/the-momentum/open-wearables).

## Backend

### Объединение данных активности с нескольких устройств
- **Файл:** `backend/app/services/summaries_service.py`
- Заменён `_filter_by_priority` (выбирал один лучший источник на дату) на `_merge_activity_by_date` — теперь данные с нескольких устройств объединяются за одну дату (например, пульс с часов + шаги с телефона)
- Аддитивные метрики (шаги, энергия, дистанция, этажи) суммируются
- Пульс берётся из наиболее широкого диапазона среди источников
- Метаданные источника выбираются по приоритету провайдера/устройства
- Lookup-и для тренировок, минут активности и интенсивности упрощены с `(date, source, device_model)` до `date`

## Frontend

### Fallback для буфера обмена по HTTP
- **Файл:** `frontend/src/lib/utils/clipboard.ts`
- Добавлен fallback через `document.execCommand('copy')` когда `navigator.clipboard` недоступен (не-HTTPS контекст, например доступ по IP через HTTP)

### Исправление проверки null в фильтре пульса
- **Файл:** `frontend/src/lib/utils/activity.ts`
- `!== null` заменено на `!= null`, чтобы также отфильтровывать `undefined`

### Скрыта кнопка "Copy Pairing Link"
- **Файлы:** `frontend/src/routes/_authenticated/users/$userId.tsx`, `frontend/src/components/user/profile-section.tsx`, `frontend/src/components/users/users-table.tsx`
- Закомментированы кнопки, связанные функции (`handleCopyPairLink`), стейты (`copied`, `copiedPairLink`) и импорты (`LinkIcon`) — страница pairing требует авторизации, поэтому ссылка бесполезна при открытии с телефона

### Скрыта кнопка "Upload Apple Health XML"
- **Файлы:** `frontend/src/routes/_authenticated/users/$userId.tsx`, `frontend/src/components/users/users-table.tsx`
- Закомментированы кнопки загрузки Apple Health XML, связанные функции, импорты и стейты — неактуально для Samsung

## Конфигурация (локальная, не закоммичена)

### `backend/config/.env`
- `CORS_ORIGINS` — добавлен `http://192.168.0.101:3000` для доступа из локальной сети
- `FRONTEND_URL` — изменён на `http://192.168.0.101:3000`
- `USER_INVITATION_CODE_EXPIRE_DAYS` — изменён с 7 на 365

### `docker-compose.yml`
- Frontend переключён с `Dockerfile.dev` на `Dockerfile` (prod-сборка)
- Добавлен build arg `VITE_API_URL` с IP локальной сети

### `frontend/.env`
- Создан с `VITE_API_URL=http://192.168.0.101:8000`
