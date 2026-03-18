# CLAUDE.md

## О проекте

Система мониторинга здоровья сотрудников на базе данных с умных часов. Администратор видит метрики каждого сотрудника через веб-панель. Адаптация open-source проекта [Open Wearables](https://github.com/the-momentum/open-wearables) для корпоративного использования.

Проект состоит из трёх компонентов:

| Компонент          | Репозиторий                         | Описание                                                                         |
| ------------------ | ----------------------------------- | -------------------------------------------------------------------------------- |
| Веб-платформа      | `open-wearables` (этот репозиторий) | FastAPI бэкенд + React панель администратора                                     |
| Android SDK        | `open-wearables-sdk`                | Kotlin-библиотека для сбора данных с часов через Health Connect / Samsung Health |
| Android-приложение | `open-wearables-android-app`        | Мобильное приложение для сотрудников                                             |

### Поток данных

1. Сотрудник носит умные часы (Samsung Galaxy Watch, Google Pixel Watch и др.)
2. Android-приложение считывает данные через Health Connect / Samsung Health SDK
3. SDK синхронизирует данные на сервер каждые 3 минуты (`POST /api/v1/sdk/users/{id}/sync`)
4. Админ видит метрики в React-панели (дашборд, профили сотрудников, графики)

### Ключевые метрики

- **Кардио**: пульс, HRV, SpO2, давление, частота дыхания
- **Активность**: шаги, дистанция, калории, тренировки, VO2 Max
- **Тело**: вес, рост, процент жира, температура, глюкоза
- **Сон**: длительность, фазы (глубокий, REM, лёгкий, бодрствование)

### Процесс подключения сотрудника

Админ создаёт приглашение → сотрудник вводит URL сервера + код в приложении → приложение получает токены → автоопределение провайдера → разрешения → фоновая синхронизация.

## Разработка

Please follow the guidelines and project structure defined in ./AGENTS.md

For Cursor and other agents: Refer to .cursor/rules/ for detailed configuration.

### Связанные репозитории

При внесении изменений учитывайте связи между компонентами:

- **Backend API** (`/api/v1/sdk/users/{id}/sync`) — принимает данные от Android SDK. Формат payload: `{ provider, sdkVersion, syncTimestamp, data: { records, workouts, sleep } }`
- **Invitation flow** (`/api/v1/invitation-code/redeem`) — Android-приложение обменивает код приглашения на `user_id` + `access_token` + `refresh_token`
- **Token refresh** (`/token/refresh`) — SDK автоматически обновляет токены при 401

### Языки и локализация

Фронтенд использует i18next. Русский (`ru`) — язык по умолчанию, английский (`en`) — fallback. Переводы: `frontend/src/lib/i18n/locales/`.
