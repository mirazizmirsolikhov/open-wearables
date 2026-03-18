# Руководство по интеграции Android-приложения

Полный флоу подключения мобильного приложения к серверу Open Wearables: от ввода кода приглашения до фоновой синхронизации данных здоровья.

---

## Общая схема

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│ Админ-панель │───>│ Приложение   │───>│ Сервер       │
│              │    │ сотрудника   │    │ Open Wearables│
└─────────────┘    └──────────────┘    └──────────────┘
      │                   │                    │
  1. Создаёт         2. Вводит код        3. Выдаёт
     приглашение      + URL сервера          токены
                          │                    │
                     4. Читает данные    5. Принимает
                        Health Connect      данные
                          │                    │
                     6. Отправляет ──────────>│
                        каждые 3 мин          │
```

---

## Шаг 1. Настройка подключения

Пользователь вводит в приложении:

- **URL сервера** — базовый адрес API (например, `https://health.company.com`)
- **Код приглашения** — 8-символьный код, полученный от администратора

### Формат кода приглашения

- Ровно 8 символов
- Только заглавные буквы и цифры: `[A-Z2-9]`
- Исключены символы `0`, `1`, `O`, `I` (во избежание путаницы)
- Пример: `K7NX3FWB`
- Срок действия: 7 дней (настраивается на сервере)
- Одноразовый — после активации повторно использовать нельзя

---

## Шаг 2. Активация кода (получение токенов)

```
POST /api/v1/invitation-code/redeem
Content-Type: application/json
```

**Авторизация**: не требуется (публичный эндпоинт).

### Запрос

```json
{
  "code": "K7NX3FWB"
}
```

### Успешный ответ (200)

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "refresh_token": "rt-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "expires_in": 3600,
  "user_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Поле            | Описание                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `access_token`  | JWT-токен для запросов к API. Время жизни — 60 минут                                                   |
| `refresh_token` | Токен для обновления access_token. Формат: `rt-{32 hex символа}`. Без срока действия (живёт до отзыва) |
| `expires_in`    | Время жизни access_token в секундах                                                                    |
| `user_id`       | UUID пользователя — используется во всех последующих запросах                                          |

### Ошибки

| Код | Причина                                                   |
| --- | --------------------------------------------------------- |
| 400 | Неверный формат кода (не 8 символов, запрещённые символы) |
| 404 | Код не найден, истёк, уже использован или отозван         |

### Что сохранить на устройстве

```
✅ access_token    → EncryptedSharedPreferences / Android Keystore
✅ refresh_token   → EncryptedSharedPreferences / Android Keystore
✅ user_id         → SharedPreferences (не секрет)
✅ server_url      → SharedPreferences
❌ Не логировать токены!
```

---

## Шаг 3. Структура JWT-токена

Приложению не нужно разбирать JWT — сервер валидирует его сам. Но для понимания:

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "scope": "sdk",
  "app_id": "invite:developer-uuid",
  "exp": 1711011600
}
```

| Поле     | Описание                                                     |
| -------- | ------------------------------------------------------------ |
| `sub`    | ID пользователя (совпадает с `user_id` из ответа)            |
| `scope`  | Всегда `"sdk"` — ограничивает доступ только к SDK-эндпоинтам |
| `app_id` | Источник токена                                              |
| `exp`    | Unix timestamp истечения                                     |

**Важно**: SDK-токен (scope=sdk) имеет доступ **только** к эндпоинту `/api/v1/sdk/users/{id}/sync`. Все остальные эндпоинты API вернут 401/403.

---

## Шаг 4. Отправка данных здоровья

```
POST /api/v1/sdk/users/{user_id}/sync
Authorization: Bearer {access_token}
Content-Type: application/json
```

### Запрос

```json
{
  "provider": "samsung",
  "sdkVersion": "1.0.0",
  "syncTimestamp": "2026-03-18T13:30:00+05:00",
  "data": {
    "records": [
      {
        "id": "hr-20260318-083000",
        "type": "HEART_RATE",
        "startDate": "2026-03-18T08:30:00Z",
        "endDate": "2026-03-18T08:30:00Z",
        "value": 72,
        "unit": "bpm",
        "source": {
          "deviceName": "Galaxy Watch7",
          "deviceManufacturer": "Samsung",
          "deviceModel": "SM-R960",
          "deviceType": "watch",
          "recordingMethod": "automatic"
        }
      },
      {
        "id": "steps-20260318-0800",
        "type": "STEP_COUNT",
        "startDate": "2026-03-18T08:00:00Z",
        "endDate": "2026-03-18T09:00:00Z",
        "value": 1543,
        "unit": "count",
        "source": {
          "deviceName": "Galaxy Watch7",
          "deviceType": "watch"
        }
      }
    ],
    "sleep": [
      {
        "id": "slp-20260318-phase1",
        "parentId": "slp-20260318",
        "stage": "light",
        "startDate": "2026-03-17T23:00:00Z",
        "endDate": "2026-03-17T23:45:00Z",
        "source": { "deviceName": "Galaxy Watch7", "deviceType": "watch" }
      },
      {
        "id": "slp-20260318-phase2",
        "parentId": "slp-20260318",
        "stage": "deep",
        "startDate": "2026-03-17T23:45:00Z",
        "endDate": "2026-03-18T01:00:00Z",
        "source": { "deviceName": "Galaxy Watch7", "deviceType": "watch" }
      }
    ],
    "workouts": [
      {
        "id": "wrk-20260318-run",
        "type": "running",
        "startDate": "2026-03-18T06:00:00Z",
        "endDate": "2026-03-18T06:45:00Z",
        "title": "Утренняя пробежка",
        "source": {
          "deviceName": "Galaxy Watch7",
          "deviceType": "watch",
          "recordingMethod": "active"
        },
        "values": [
          { "type": "duration", "value": 2700000, "unit": "ms" },
          { "type": "distance", "value": 5234.0, "unit": "m" },
          { "type": "calories", "value": 345.5, "unit": "kcal" },
          { "type": "averageHeartRate", "value": 142.3, "unit": "bpm" },
          { "type": "maxHeartRate", "value": 172.0, "unit": "bpm" }
        ]
      }
    ]
  }
}
```

### Успешный ответ (202 Accepted)

```json
{
  "status_code": 202,
  "response": "Import task queued successfully",
  "user_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Код 202** — данные приняты и поставлены в очередь на асинхронную обработку. Это НЕ означает, что данные уже сохранены в БД.

### Ошибки

| Код | Причина                                    |
| --- | ------------------------------------------ |
| 400 | Неподдерживаемый провайдер                 |
| 401 | Отсутствует или невалидный токен           |
| 403 | `user_id` в URL не совпадает с `sub` в JWT |
| 422 | Невалидный формат JSON-тела                |

### Поддерживаемые провайдеры

| Значение             | Когда использовать                                         |
| -------------------- | ---------------------------------------------------------- |
| `samsung`            | Samsung Health / Health Connect на Samsung-устройствах     |
| `google`             | Google Health Connect на устройствах других производителей |
| `apple`              | Apple HealthKit (iOS)                                      |
| `auto-health-export` | Auto Health Export (iOS)                                   |

Провайдер указывается явно в каждом запросе. Автодетекция отсутствует.

**Рекомендация для Android**: определяйте провайдер один раз при старте приложения:

- Samsung-устройство → `"samsung"`
- Остальные (Pixel, Xiaomi, и т.д.) → `"google"`

---

## Шаг 5. Обновление токена

Access token живёт 60 минут. Когда он истекает, сервер вернёт `401`. Приложение должно автоматически обновить токен.

```
POST /api/v1/token/refresh
Content-Type: application/json
```

**Авторизация**: не требуется (refresh_token — это и есть credential).

### Запрос

```json
{
  "refresh_token": "rt-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
}
```

### Успешный ответ (200)

```json
{
  "access_token": "eyJ...(новый JWT)...",
  "token_type": "bearer",
  "refresh_token": "rt-f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3",
  "expires_in": 3600
}
```

### Критически важно: ротация токенов

- Старый `refresh_token` **немедленно отзывается** после использования
- В ответе приходит **новый** `refresh_token`
- Приложение **обязано** сохранить новый refresh_token и забыть старый
- Попытка повторно использовать старый → `401`

### Ошибки

| Код | Причина                             | Действие                              |
| --- | ----------------------------------- | ------------------------------------- |
| 401 | Refresh token отозван или невалиден | Показать экран ввода кода приглашения |
| 404 | Refresh token не найден             | Показать экран ввода кода приглашения |

---

## Шаг 6. Полный алгоритм синхронизации

```
┌──────────────────────────────────────────────┐
│           WorkManager (каждые 3 мин)          │
│                                              │
│  1. Прочитать данные из Health Connect       │
│     (с lastSyncTimestamp до now)             │
│                                              │
│  2. Сформировать JSON payload               │
│     (records + sleep + workouts)             │
│                                              │
│  3. POST /sdk/users/{id}/sync               │
│     ┌─── 202? ─── Успех                     │
│     │                ↓                       │
│     │         Обновить lastSyncTimestamp      │
│     │                                        │
│     ├─── 401? ─── Токен истёк               │
│     │                ↓                       │
│     │         POST /token/refresh            │
│     │         ┌─── 200? ─── Сохранить новые  │
│     │         │              токены           │
│     │         │              ↓               │
│     │         │         Повторить sync        │
│     │         │                              │
│     │         └─── 401? ─── Refresh невалиден│
│     │                        ↓               │
│     │                   Показать уведомление  │
│     │                   "Введите код заново"  │
│     │                                        │
│     └─── 5xx? ─── Сервер недоступен         │
│                      ↓                       │
│                 Retry через WorkManager       │
│                 (exponential backoff)         │
└──────────────────────────────────────────────┘
```

### Псевдокод (Kotlin)

```kotlin
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val prefs = TokenStorage(applicationContext)
        val serverUrl = prefs.serverUrl ?: return Result.failure()
        val userId = prefs.userId ?: return Result.failure()
        var accessToken = prefs.accessToken ?: return Result.failure()

        // 1. Читаем данные из Health Connect
        val lastSync = prefs.lastSyncTimestamp
        val healthData = HealthConnectReader.readSince(lastSync)
        if (healthData.isEmpty()) return Result.success()

        // 2. Формируем payload
        val payload = SyncPayload(
            provider = detectProvider(),  // "samsung" или "google"
            sdkVersion = BuildConfig.SDK_VERSION,
            syncTimestamp = Instant.now().toString(),
            data = healthData
        )

        // 3. Отправляем
        var response = api.sync(serverUrl, userId, accessToken, payload)

        // 4. Обрабатываем 401 — обновление токена
        if (response.code == 401) {
            val refreshResult = api.refreshToken(serverUrl, prefs.refreshToken!!)

            if (refreshResult.isSuccess) {
                val tokens = refreshResult.getOrThrow()
                prefs.accessToken = tokens.accessToken
                prefs.refreshToken = tokens.refreshToken  // ВАЖНО: сохранить новый!
                accessToken = tokens.accessToken

                // Повторяем запрос
                response = api.sync(serverUrl, userId, accessToken, payload)
            } else {
                // Refresh невалиден — нужен новый код приглашения
                notifyReauthRequired()
                return Result.failure()
            }
        }

        return when {
            response.code == 202 -> {
                prefs.lastSyncTimestamp = Instant.now()
                Result.success()
            }
            response.code in 500..599 -> Result.retry()  // WorkManager повторит
            else -> Result.failure()
        }
    }

    private fun detectProvider(): String {
        return if (Build.MANUFACTURER.equals("samsung", ignoreCase = true)) {
            "samsung"
        } else {
            "google"
        }
    }
}
```

### Настройка WorkManager

```kotlin
val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(3, TimeUnit.MINUTES)
    .setConstraints(
        Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
    )
    .setBackoffCriteria(
        BackoffPolicy.EXPONENTIAL,
        WorkRequest.MIN_BACKOFF_MILLIS,  // 10 секунд
        TimeUnit.MILLISECONDS
    )
    .build()

WorkManager.getInstance(context).enqueueUniquePeriodicWork(
    "health_sync",
    ExistingPeriodicWorkPolicy.KEEP,
    syncRequest
)
```

---

## Шаг 7. Чтение данных из Health Connect

### Необходимые разрешения

```xml
<!-- AndroidManifest.xml -->
<uses-permission android:name="android.permission.health.READ_HEART_RATE" />
<uses-permission android:name="android.permission.health.READ_STEPS" />
<uses-permission android:name="android.permission.health.READ_DISTANCE" />
<uses-permission android:name="android.permission.health.READ_TOTAL_CALORIES_BURNED" />
<uses-permission android:name="android.permission.health.READ_OXYGEN_SATURATION" />
<uses-permission android:name="android.permission.health.READ_BLOOD_PRESSURE" />
<uses-permission android:name="android.permission.health.READ_SLEEP" />
<uses-permission android:name="android.permission.health.READ_EXERCISE" />
<uses-permission android:name="android.permission.health.READ_BODY_TEMPERATURE" />
<uses-permission android:name="android.permission.health.READ_WEIGHT" />
<uses-permission android:name="android.permission.health.READ_HEIGHT" />
<uses-permission android:name="android.permission.health.READ_RESPIRATORY_RATE" />
<uses-permission android:name="android.permission.health.READ_BLOOD_GLUCOSE" />
<uses-permission android:name="android.permission.health.READ_HEART_RATE_VARIABILITY" />
<uses-permission android:name="android.permission.health.READ_RESTING_HEART_RATE" />
```

### Маппинг Health Connect → API

| Health Connect Record                                        | API type                   | API unit      |
| ------------------------------------------------------------ | -------------------------- | ------------- |
| `HeartRateRecord.samples[].beatsPerMinute`                   | `HEART_RATE`               | `bpm`         |
| `RestingHeartRateRecord.beatsPerMinute`                      | `RESTING_HEART_RATE`       | `bpm`         |
| `HeartRateVariabilityRmssdRecord.heartRateVariabilityMillis` | `HEART_RATE_VARIABILITY`   | `ms`          |
| `StepsRecord.count`                                          | `STEP_COUNT`               | `count`       |
| `DistanceRecord.distance.inMeters`                           | `DISTANCE`                 | `m`           |
| `TotalCaloriesBurnedRecord.energy.inKilocalories`            | `ACTIVE_CALORIES_BURNED`   | `kcal`        |
| `OxygenSaturationRecord.percentage.value`                    | `OXYGEN_SATURATION`        | `%`           |
| `BloodPressureRecord.systolic.inMillimetersOfMercury`        | `BLOOD_PRESSURE_SYSTOLIC`  | `mmHg`        |
| `BloodPressureRecord.diastolic.inMillimetersOfMercury`       | `BLOOD_PRESSURE_DIASTOLIC` | `mmHg`        |
| `BodyTemperatureRecord.temperature.inCelsius`                | `BODY_TEMPERATURE`         | `°C`          |
| `WeightRecord.weight.inKilograms`                            | `WEIGHT`                   | `kg`          |
| `HeightRecord.height.inMeters`                               | `HEIGHT`                   | `m`           |
| `RespiratoryRateRecord.rate`                                 | `RESPIRATORY_RATE`         | `breaths/min` |
| `BloodGlucoseRecord.level.inMilligramsPerDeciliter`          | `BLOOD_GLUCOSE`            | `mg/dL`       |
| `Vo2MaxRecord.vo2MillilitersPerMinuteKilogram`               | `VO2_MAX`                  | `mL/kg/min`   |

### Маппинг Health Connect Sleep → API

| Health Connect SleepStage | API stage  |
| ------------------------- | ---------- |
| `STAGE_TYPE_AWAKE`        | `awake`    |
| `STAGE_TYPE_SLEEPING`     | `sleeping` |
| `STAGE_TYPE_LIGHT`        | `light`    |
| `STAGE_TYPE_DEEP`         | `deep`     |
| `STAGE_TYPE_REM`          | `rem`      |
| `STAGE_TYPE_OUT_OF_BED`   | `awake`    |
| `STAGE_TYPE_UNKNOWN`      | `unknown`  |

Каждая сессия сна из Health Connect (`SleepSessionRecord`) содержит массив `stages`. Каждый stage отправляется как отдельный `SleepRecord` с общим `parentId`.

### Маппинг Health Connect Exercise → API

| Health Connect ExerciseType       | API type            |
| --------------------------------- | ------------------- |
| `EXERCISE_TYPE_RUNNING`           | `running`           |
| `EXERCISE_TYPE_WALKING`           | `walking`           |
| `EXERCISE_TYPE_BIKING`            | `cycling`           |
| `EXERCISE_TYPE_SWIMMING_POOL`     | `swimming`          |
| `EXERCISE_TYPE_HIKING`            | `hiking`            |
| `EXERCISE_TYPE_STRENGTH_TRAINING` | `strength_training` |
| `EXERCISE_TYPE_YOGA`              | `yoga`              |
| `EXERCISE_TYPE_PILATES`           | `pilates`           |
| (все остальные)                   | см. Приложение Б    |

---

## Рекомендации по реализации

### Батчинг

Нет жёсткого лимита на размер запроса, но рекомендуется:

- Не более **500-1000 records** в одном запросе
- Если данных много (первая синхронизация) — разбить на несколько запросов
- Каждый запрос содержит свой `syncTimestamp`

### Дедупликация

Сервер обрабатывает дубликаты на основе комбинации `(data_source, series_type, recorded_at)`. Если отправить одну и ту же точку дважды — она не продублируется. Безопасно повторять неудачные запросы.

### Оптимизация батареи

На некоторых устройствах (Xiaomi, Huawei, Samsung с агрессивными настройками) Android может убить фоновый процесс. Рекомендации:

1. Попросить пользователя добавить приложение в исключения оптимизации батареи
2. Использовать `setExpedited()` для критичных sync-задач
3. Показывать persistent notification во время синхронизации

### Хранение lastSyncTimestamp

- Сохранять **после** успешного ответа 202
- При первом запуске — синхронизировать данные за последние 7 дней
- Хранить отдельный timestamp для каждого типа данных (опционально)

### Обработка ошибок сети

```
Нет сети        → WorkManager автоматически ждёт появления сети
Таймаут         → Retry с exponential backoff
5xx             → Retry через WorkManager (до 3 попыток)
401             → Обновить токен → Retry → При неудаче: реавторизация
403             → Ошибка конфигурации (user_id mismatch) — показать ошибку
400/422         → Баг в приложении — залогировать, не повторять
```

---

## Полная диаграмма состояний приложения

```
┌─────────────────┐
│  Первый запуск  │
│  (нет токенов)  │
└────────┬────────┘
         ↓
┌─────────────────┐
│  Ввод URL +     │◄──────────────────────┐
│  код приглашения │                       │
└────────┬────────┘                       │
         ↓                                │
    POST /invitation-code/redeem          │
         │                                │
    ┌────┴────┐                           │
    │ 200 OK  │                           │
    └────┬────┘                           │
         ↓                                │
  Сохранить токены                        │
         ↓                                │
┌─────────────────┐                       │
│  Запросить      │                       │
│  разрешения HC  │                       │
└────────┬────────┘                       │
         ↓                                │
┌─────────────────┐                       │
│  Фоновая sync   │                       │
│  (WorkManager)  │─── 401 + refresh fail ─┘
│  каждые 3 мин   │
└─────────────────┘
```

---

## Справочник эндпоинтов

| Метод | Эндпоинт                           | Auth                       | Описание                          |
| ----- | ---------------------------------- | -------------------------- | --------------------------------- |
| POST  | `/api/v1/invitation-code/redeem`   | нет                        | Активация кода, получение токенов |
| POST  | `/api/v1/token/refresh`            | нет (refresh_token в теле) | Обновление access_token           |
| POST  | `/api/v1/sdk/users/{user_id}/sync` | Bearer token               | Отправка данных здоровья          |

---

# Приложение А. Формат данных синхронизации

## Корневые поля запроса

| Поле            | Тип                 | Обязательное | Описание            |
| --------------- | ------------------- | :----------: | ------------------- |
| `provider`      | string              |      да      | Провайдер данных    |
| `sdkVersion`    | string              |      да      | Версия SDK          |
| `syncTimestamp` | datetime (ISO 8601) |      да      | Время синхронизации |
| `data`          | object              |      да      | Контейнер с данными |

### data

| Поле       | Тип            | По умолчанию | Описание                       |
| ---------- | -------------- | :----------: | ------------------------------ |
| `records`  | MetricRecord[] |     `[]`     | Метрики (пульс, шаги, SpO2...) |
| `sleep`    | SleepRecord[]  |     `[]`     | Фазы сна                       |
| `workouts` | Workout[]      |     `[]`     | Тренировки                     |

Все три массива опциональны.

---

## MetricRecord — метрики здоровья

Точечные измерения: пульс, шаги, давление, SpO2 и т.д.

```json
{
  "id": "abc-123",
  "parentId": "parent-abc",
  "type": "HEART_RATE",
  "startDate": "2026-03-18T08:30:00Z",
  "endDate": "2026-03-18T08:30:00Z",
  "zoneOffset": "+05:00",
  "value": 72.0,
  "unit": "bpm",
  "source": { ... },
  "metadata": {}
}
```

### Поля MetricRecord

| Поле         | Тип          | Обязательное | Описание                                                                                |
| ------------ | ------------ | :----------: | --------------------------------------------------------------------------------------- |
| `id`         | string       |     нет      | Уникальный ID записи                                                                    |
| `parentId`   | string       |     нет      | ID родительской записи (для группировки, напр. систолическое + диастолическое давление) |
| `type`       | string       |     нет      | Тип метрики (см. таблицы ниже)                                                          |
| `startDate`  | datetime     |      да      | Начало измерения                                                                        |
| `endDate`    | datetime     |      да      | Конец измерения                                                                         |
| `zoneOffset` | string       |     нет      | Часовой пояс, напр. `"+05:00"`, `"-03:00"`                                              |
| `value`      | decimal      |      да      | Числовое значение                                                                       |
| `unit`       | string       |     нет      | Единица измерения (`bpm`, `mmHg`, `%`, `m`, `kcal`...)                                  |
| `source`     | SourceInfo   |     нет      | Информация об устройстве                                                                |
| `metadata`   | object/array |     нет      | Дополнительные данные                                                                   |

### Типы метрик

#### Сердце и кардио

| Тип (Android)            | Тип (Apple HealthKit)                                | Описание                       | Единица |
| ------------------------ | ---------------------------------------------------- | ------------------------------ | ------- |
| `HEART_RATE`             | `HKQuantityTypeIdentifierHeartRate`                  | Пульс                          | bpm     |
| `RESTING_HEART_RATE`     | `HKQuantityTypeIdentifierRestingHeartRate`           | Пульс в покое                  | bpm     |
| `HEART_RATE_VARIABILITY` | `HKQuantityTypeIdentifierHeartRateVariabilitySDNN`   | Вариабельность пульса (HRV)    | ms      |
| —                        | `HKQuantityTypeIdentifierHeartRateRecoveryOneMinute` | Восстановление пульса за 1 мин | bpm     |
| —                        | `HKQuantityTypeIdentifierWalkingHeartRateAverage`    | Средний пульс при ходьбе       | bpm     |

#### Кровь и дыхание

| Тип (Android)              | Тип (Apple HealthKit)                                        | Описание                        | Единица     |
| -------------------------- | ------------------------------------------------------------ | ------------------------------- | ----------- |
| `OXYGEN_SATURATION`        | `HKQuantityTypeIdentifierOxygenSaturation`                   | SpO2                            | %           |
| `BLOOD_GLUCOSE`            | `HKQuantityTypeIdentifierBloodGlucose`                       | Глюкоза в крови                 | mg/dL       |
| `BLOOD_PRESSURE_SYSTOLIC`  | `HKQuantityTypeIdentifierBloodPressureSystolic`              | Систолическое давление          | mmHg        |
| `BLOOD_PRESSURE_DIASTOLIC` | `HKQuantityTypeIdentifierBloodPressureDiastolic`             | Диастолическое давление         | mmHg        |
| `RESPIRATORY_RATE`         | `HKQuantityTypeIdentifierRespiratoryRate`                    | Частота дыхания                 | breaths/min |
| —                          | `HKQuantityTypeIdentifierBloodAlcoholContent`                | Содержание алкоголя в крови     | %           |
| —                          | `HKQuantityTypeIdentifierPeripheralPerfusionIndex`           | Индекс периферической перфузии  | %           |
| —                          | `HKQuantityTypeIdentifierForcedVitalCapacity`                | Форсированная жизненная ёмкость | L           |
| —                          | `HKQuantityTypeIdentifierForcedExpiratoryVolume1`            | ОФВ1                            | L           |
| —                          | `HKQuantityTypeIdentifierPeakExpiratoryFlowRate`             | Пиковая скорость выдоха         | L/min       |
| —                          | `HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances` | Нарушения дыхания во сне        | events/hr   |

#### Тело

| Тип (Android)          | Тип (Apple HealthKit)                                   | Описание                    | Единица |
| ---------------------- | ------------------------------------------------------- | --------------------------- | ------- |
| `HEIGHT`               | `HKQuantityTypeIdentifierHeight`                        | Рост                        | m       |
| `WEIGHT`               | `HKQuantityTypeIdentifierBodyMass`                      | Вес                         | kg      |
| `BODY_FAT`             | `HKQuantityTypeIdentifierBodyFatPercentage`             | Процент жира                | %       |
| `BMI`                  | `HKQuantityTypeIdentifierBodyMassIndex`                 | Индекс массы тела           | —       |
| `BODY_TEMPERATURE`     | `HKQuantityTypeIdentifierBodyTemperature`               | Температура тела            | °C      |
| `LEAN_BODY_MASS`       | `HKQuantityTypeIdentifierLeanBodyMass`                  | Безжировая масса            | kg      |
| `SKELETAL_MUSCLE_MASS` | —                                                       | Мышечная масса              | kg      |
| `BODY_FAT_MASS`        | —                                                       | Жировая масса               | kg      |
| —                      | `HKQuantityTypeIdentifierBasalBodyTemperature`          | Базальная температура       | °C      |
| —                      | `HKQuantityTypeIdentifierWaistCircumference`            | Обхват талии                | m       |
| —                      | `HKQuantityTypeIdentifierAppleSleepingWristTemperature` | Температура запястья во сне | °C      |

#### Фитнес

| Тип (Android) | Тип (Apple HealthKit)                               | Описание               | Единица   |
| ------------- | --------------------------------------------------- | ---------------------- | --------- |
| `VO2_MAX`     | `HKQuantityTypeIdentifierVO2Max`                    | VO2 Max                | mL/kg/min |
| —             | `HKQuantityTypeIdentifierSixMinuteWalkTestDistance` | Тест 6-минутной ходьбы | m         |

#### Активность — базовые

| Тип (Android)            | Тип (Apple HealthKit)                        | Описание             | Единица |
| ------------------------ | -------------------------------------------- | -------------------- | ------- |
| `STEP_COUNT`             | `HKQuantityTypeIdentifierStepCount`          | Шаги                 | count   |
| `ACTIVE_CALORIES_BURNED` | `HKQuantityTypeIdentifierActiveEnergyBurned` | Активные калории     | kcal    |
| `BASAL_METABOLIC_RATE`   | `HKQuantityTypeIdentifierBasalEnergyBurned`  | Базальный метаболизм | kcal    |
| `FLOORS_CLIMBED`         | `HKQuantityTypeIdentifierFlightsClimbed`     | Этажи / пролёты      | count   |
| —                        | `HKQuantityTypeIdentifierAppleStandTime`     | Время стоя           | min     |
| —                        | `HKQuantityTypeIdentifierAppleExerciseTime`  | Время тренировок     | min     |
| —                        | `HKQuantityTypeIdentifierAppleMoveTime`      | Время движения       | min     |

#### Активность — дистанция

| Тип (Android) | Тип (Apple HealthKit)                                | Описание                         | Единица |
| ------------- | ---------------------------------------------------- | -------------------------------- | ------- |
| `DISTANCE`    | `HKQuantityTypeIdentifierDistanceWalkingRunning`     | Дистанция (ходьба/бег)           | m       |
| —             | `HKQuantityTypeIdentifierDistanceCycling`            | Дистанция (велосипед)            | m       |
| —             | `HKQuantityTypeIdentifierDistanceSwimming`           | Дистанция (плавание)             | m       |
| —             | `HKQuantityTypeIdentifierDistanceDownhillSnowSports` | Дистанция (горнолыжные)          | m       |
| —             | `HKQuantityTypeIdentifierDistancePaddleSports`       | Дистанция (гребля)               | m       |
| —             | `HKQuantityTypeIdentifierDistanceRowing`             | Дистанция (академическая гребля) | m       |
| —             | `HKQuantityTypeIdentifierDistanceSkatingSports`      | Дистанция (коньки)               | m       |
| —             | `HKQuantityTypeIdentifierDistanceWheelchair`         | Дистанция (кресло-коляска)       | m       |
| —             | `HKQuantityTypeIdentifierDistanceCrossCountrySkiing` | Дистанция (беговые лыжи)         | m       |

#### Ходьба

| Тип                                                      | Описание                     | Единица |
| -------------------------------------------------------- | ---------------------------- | ------- |
| `HKQuantityTypeIdentifierWalkingStepLength`              | Длина шага                   | m       |
| `HKQuantityTypeIdentifierWalkingSpeed`                   | Скорость ходьбы              | m/s     |
| `HKQuantityTypeIdentifierWalkingDoubleSupportPercentage` | Двойная опора                | %       |
| `HKQuantityTypeIdentifierWalkingAsymmetryPercentage`     | Асимметрия ходьбы            | %       |
| `HKQuantityTypeIdentifierAppleWalkingSteadiness`         | Устойчивость ходьбы          | %       |
| `HKQuantityTypeIdentifierStairDescentSpeed`              | Скорость спуска по лестнице  | m/s     |
| `HKQuantityTypeIdentifierStairAscentSpeed`               | Скорость подъёма по лестнице | m/s     |

#### Бег

| Тип                                                  | Описание                | Единица |
| ---------------------------------------------------- | ----------------------- | ------- |
| `HKQuantityTypeIdentifierRunningPower`               | Мощность бега           | W       |
| `HKQuantityTypeIdentifierRunningSpeed`               | Скорость бега           | m/s     |
| `HKQuantityTypeIdentifierRunningVerticalOscillation` | Вертикальные колебания  | cm      |
| `HKQuantityTypeIdentifierRunningGroundContactTime`   | Время контакта с землёй | ms      |
| `HKQuantityTypeIdentifierRunningStrideLength`        | Длина шага при беге     | m       |

#### Велосипед

| Тип                                                       | Описание | Единица |
| --------------------------------------------------------- | -------- | ------- |
| `HKQuantityTypeIdentifierCyclingCadence`                  | Каденс   | rpm     |
| `HKQuantityTypeIdentifierCyclingFunctionalThresholdPower` | FTP      | W       |
| `HKQuantityTypeIdentifierCyclingPower`                    | Мощность | W       |
| `HKQuantityTypeIdentifierCyclingSpeed`                    | Скорость | m/s     |

#### Плавание

| Тип                                           | Описание           | Единица |
| --------------------------------------------- | ------------------ | ------- |
| `HKQuantityTypeIdentifierSwimmingStrokeCount` | Количество гребков | count   |

#### Окружающая среда

| Тип                                                   | Описание               | Единица |
| ----------------------------------------------------- | ---------------------- | ------- |
| `HKQuantityTypeIdentifierEnvironmentalAudioExposure`  | Уровень шума окружения | dB      |
| `HKQuantityTypeIdentifierHeadphoneAudioExposure`      | Громкость наушников    | dB      |
| `HKQuantityTypeIdentifierEnvironmentalSoundReduction` | Шумоподавление         | dB      |
| `HKQuantityTypeIdentifierTimeInDaylight`              | Время на свету         | min     |
| `HKQuantityTypeIdentifierUVExposure`                  | УФ-облучение           | —       |
| `HKQuantityTypeIdentifierUnderwaterDepth`             | Глубина под водой      | m       |
| `HKQuantityTypeIdentifierWaterTemperature`            | Температура воды       | °C      |

#### Другое

| Тип                                                   | Описание                     | Единица |
| ----------------------------------------------------- | ---------------------------- | ------- |
| `HKQuantityTypeIdentifierElectrodermalActivity`       | Электродермальная активность | μS      |
| `HKQuantityTypeIdentifierNumberOfTimesFallen`         | Количество падений           | count   |
| `HKQuantityTypeIdentifierInhalerUsage`                | Использование ингалятора     | count   |
| `HKQuantityTypeIdentifierNumberOfAlcoholicBeverages`  | Алкогольные напитки          | count   |
| `HKQuantityTypeIdentifierInsulinDelivery`             | Доставка инсулина            | IU      |
| `HKQuantityTypeIdentifierAtrialFibrillationBurden`    | Фибрилляция предсердий       | %       |
| `HKQuantityTypeIdentifierPhysicalEffort`              | Физическое усилие            | —       |
| `HKQuantityTypeIdentifierWorkoutEffortScore`          | Оценка усилий тренировки     | —       |
| `HKQuantityTypeIdentifierEstimatedWorkoutEffortScore` | Расчётная оценка усилий      | —       |
| `HKQuantityTypeIdentifierNikeFuel`                    | Nike Fuel                    | —       |
| `HKQuantityTypeIdentifierPushCount`                   | Толчки (кресло-коляска)      | count   |
| `HYDRATION`                                           | Потребление воды             | L       |

---

## SleepRecord — фазы сна

Каждая запись — одна фаза (не целая ночь). Полная сессия сна состоит из нескольких записей с одинаковым `parentId`.

```json
{
  "id": "slp-001-phase-1",
  "parentId": "slp-001",
  "stage": "deep",
  "startDate": "2026-03-17T23:10:00Z",
  "endDate": "2026-03-18T00:30:00Z",
  "zoneOffset": "+05:00",
  "source": { ... },
  "values": [],
  "metadata": {}
}
```

### Поля SleepRecord

| Поле         | Тип          | Обязательное | Описание                            |
| ------------ | ------------ | :----------: | ----------------------------------- |
| `id`         | string       |     нет      | Уникальный ID фазы                  |
| `parentId`   | string       |     нет      | ID сессии сна (для группировки фаз) |
| `stage`      | string       |      да      | Фаза сна (см. таблицу)              |
| `startDate`  | datetime     |      да      | Начало фазы                         |
| `endDate`    | datetime     |      да      | Конец фазы                          |
| `zoneOffset` | string       |     нет      | Часовой пояс                        |
| `source`     | SourceInfo   |     нет      | Информация об устройстве            |
| `values`     | array        |     нет      | Дополнительные значения             |
| `metadata`   | object/array |     нет      | Метаданные                          |

### Фазы сна

| Значение   | Описание                 |
| ---------- | ------------------------ |
| `in_bed`   | В кровати (не спит)      |
| `sleeping` | Сон (фаза не определена) |
| `awake`    | Бодрствование            |
| `light`    | Лёгкий сон               |
| `deep`     | Глубокий сон             |
| `rem`      | REM-фаза                 |
| `unknown`  | Неизвестно               |

### Пример полной ночи

```json
[
  { "parentId": "night-001", "stage": "light",  "startDate": "2026-03-17T23:00:00Z", "endDate": "2026-03-17T23:45:00Z" },
  { "parentId": "night-001", "stage": "deep",   "startDate": "2026-03-17T23:45:00Z", "endDate": "2026-03-18T01:00:00Z" },
  { "parentId": "night-001", "stage": "rem",    "startDate": "2026-03-18T01:00:00Z", "endDate": "2026-03-18T01:30:00Z" },
  { "parentId": "night-001", "stage": "light",  "startDate": "2026-03-18T01:30:00Z", "endDate": "2026-03-18T02:15:00Z" },
  { "parentId": "night-001", "stage": "deep",   "startDate": "2026-03-18T02:15:00Z", "endDate": "2026-03-18T03:30:00Z" },
  { "parentId": "night-001", "stage": "awake",  "startDate": "2026-03-18T03:30:00Z", "endDate": "2026-03-18T03:35:00Z" },
  { "parentId": "night-001", "stage": "rem",    "startDate": "2026-03-18T03:35:00Z", "endDate": "2026-03-18T04:30:00Z" },
  { "parentId": "night-001", "stage": "light",  "startDate": "2026-03-18T04:30:00Z", "endDate": "2026-03-18T06:00:00Z" }
]
```

---

# Приложение Б. Типы тренировок и статистика

## Workout — тренировки

```json
{
  "id": "wrk-001",
  "type": "running",
  "startDate": "2026-03-18T06:00:00Z",
  "endDate": "2026-03-18T06:45:00Z",
  "title": "Утренняя пробежка",
  "source": { ... },
  "values": [
    { "type": "duration", "value": 2700000, "unit": "ms" },
    { "type": "calories", "value": 345.5, "unit": "kcal" },
    { "type": "distance", "value": 5234.0, "unit": "m" }
  ]
}
```

### Поля Workout

| Поле         | Тип                | Обязательное | Описание                          |
| ------------ | ------------------ | :----------: | --------------------------------- |
| `id`         | string             |     нет      | Уникальный ID тренировки          |
| `parentId`   | string             |     нет      | ID родительской записи            |
| `type`       | string             |     нет      | Тип тренировки (см. таблицу)      |
| `startDate`  | datetime           |      да      | Начало                            |
| `endDate`    | datetime           |      да      | Конец                             |
| `zoneOffset` | string             |     нет      | Часовой пояс                      |
| `title`      | string             |     нет      | Название                          |
| `notes`      | string             |     нет      | Заметки                           |
| `source`     | SourceInfo         |     нет      | Информация об устройстве          |
| `values`     | WorkoutStatistic[] |     нет      | Статистика тренировки             |
| `segments`   | array              |     нет      | Сегменты                          |
| `laps`       | array              |     нет      | Круги                             |
| `route`      | array              |     нет      | GPS-маршрут                       |
| `samples`    | array              |     нет      | Сэмплы (пульс по секундам и т.д.) |
| `metadata`   | object/array       |     нет      | Метаданные                        |

### Все типы тренировок

#### Бег и ходьба

| Значение          | Описание           |
| ----------------- | ------------------ |
| `walking`         | Ходьба             |
| `running`         | Бег                |
| `hiking`          | Пеший туризм       |
| `stair_climbing`  | Подъём по лестнице |
| `stairs`          | Лестница           |
| `wheelchair_walk` | Ходьба на коляске  |
| `wheelchair_run`  | Бег на коляске     |

#### Велоспорт

| Значение       | Описание  |
| -------------- | --------- |
| `cycling`      | Велосипед |
| `hand_cycling` | Хэндбайк  |

#### Кардио и фитнес

| Значение                       | Описание                |
| ------------------------------ | ----------------------- |
| `elliptical`                   | Эллиптический тренажёр  |
| `jump_rope`                    | Скакалка                |
| `core_training`                | Тренировка кора         |
| `functional_strength_training` | Функциональная силовая  |
| `strength_training`            | Силовая тренировка      |
| `cross_training`               | Кросс-тренинг           |
| `mixed_cardio`                 | Смешанное кардио        |
| `hiit`                         | HIIT                    |
| `step_training`                | Степ-тренировка         |
| `fitness_gaming`               | Фитнес-игры             |
| `preparation_and_recovery`     | Разминка/восстановление |
| `flexibility`                  | Растяжка                |
| `cooldown`                     | Заминка                 |

#### Студийные

| Значение        | Описание            |
| --------------- | ------------------- |
| `barre`         | Барре               |
| `cardio_dance`  | Кардио-танцы        |
| `social_dance`  | Социальные танцы    |
| `yoga`          | Йога                |
| `mind_and_body` | Ментальные практики |
| `pilates`       | Пилатес             |

#### Командные виды спорта

| Значение              | Описание             |
| --------------------- | -------------------- |
| `american_football`   | Американский футбол  |
| `australian_football` | Австралийский футбол |
| `baseball`            | Бейсбол              |
| `basketball`          | Баскетбол            |
| `cricket`             | Крикет               |
| `disc_sports`         | Диск-спорт (фрисби)  |
| `handball`            | Гандбол              |
| `hockey`              | Хоккей               |
| `lacrosse`            | Лакросс              |
| `rugby`               | Регби                |
| `soccer`              | Футбол               |
| `softball`            | Софтбол              |
| `volleyball`          | Волейбол             |

#### Ракеточные виды

| Значение       | Описание          |
| -------------- | ----------------- |
| `badminton`    | Бадминтон         |
| `pickleball`   | Пиклбол           |
| `racquetball`  | Ракетбол          |
| `squash`       | Сквош             |
| `table_tennis` | Настольный теннис |
| `tennis`       | Теннис            |

#### На открытом воздухе

| Значение     | Описание      |
| ------------ | ------------- |
| `climbing`   | Скалолазание  |
| `equestrian` | Верховая езда |
| `fishing`    | Рыбалка       |
| `golf`       | Гольф         |
| `hunting`    | Охота         |
| `play`       | Активные игры |

#### Зимние виды

| Значение               | Описание            |
| ---------------------- | ------------------- |
| `cross_country_skiing` | Беговые лыжи        |
| `curling`              | Кёрлинг             |
| `downhill_skiing`      | Горные лыжи         |
| `snow_sports`          | Зимние виды (общее) |
| `snowboarding`         | Сноуборд            |
| `skating`              | Коньки              |

#### Водные виды

| Значение            | Описание             |
| ------------------- | -------------------- |
| `paddle_sports`     | Гребные виды         |
| `rowing`            | Академическая гребля |
| `sailing`           | Парусный спорт       |
| `surfing`           | Сёрфинг              |
| `swimming`          | Плавание             |
| `underwater_diving` | Дайвинг              |
| `water_fitness`     | Водный фитнес        |
| `water_polo`        | Водное поло          |
| `water_sports`      | Водные виды (общее)  |

#### Единоборства

| Значение       | Описание         |
| -------------- | ---------------- |
| `boxing`       | Бокс             |
| `kickboxing`   | Кикбоксинг       |
| `martial_arts` | Боевые искусства |
| `tai_chi`      | Тай-чи           |
| `wrestling`    | Борьба           |

#### Индивидуальные

| Значение          | Описание         |
| ----------------- | ---------------- |
| `archery`         | Стрельба из лука |
| `bowling`         | Боулинг          |
| `fencing`         | Фехтование       |
| `gymnastics`      | Гимнастика       |
| `track_and_field` | Лёгкая атлетика  |

#### Мультиспорт

| Значение        | Описание              |
| --------------- | --------------------- |
| `swim_bike_run` | Триатлон              |
| `transition`    | Переход между этапами |

#### Устаревшие (поддерживаются)

| Значение                          | Описание                 |
| --------------------------------- | ------------------------ |
| `dance`                           | Танцы                    |
| `dance_inspired_training`         | Танцевальная тренировка  |
| `mixed_metabolic_cardio_training` | Смешанная метаболическая |

#### Прочее

| Значение | Описание |
| -------- | -------- |
| `other`  | Другое   |

---

## WorkoutStatistic — статистика тренировки

Массив `values` в тренировке. Каждый элемент:

```json
{ "type": "distance", "value": 5234.0, "unit": "m" }
```

### Длительность и энергия

| type                 | Описание           | unit |
| -------------------- | ------------------ | ---- |
| `duration`           | Длительность       | ms   |
| `totalDuration`      | Общая длительность | ms   |
| `activeEnergyBurned` | Активные калории   | kcal |
| `basalEnergyBurned`  | Базальные калории  | kcal |
| `calories`           | Калории            | kcal |
| `totalCalories`      | Всего калорий      | kcal |

### Дистанция и движение

| type                  | Описание  | unit  |
| --------------------- | --------- | ----- |
| `distance`            | Дистанция | m     |
| `stepCount`           | Шаги      | count |
| `swimmingStrokeCount` | Гребки    | count |

### Пульс

| type               | Описание              | unit |
| ------------------ | --------------------- | ---- |
| `minHeartRate`     | Минимальный пульс     | bpm  |
| `averageHeartRate` | Средний пульс         | bpm  |
| `maxHeartRate`     | Максимальный пульс    | bpm  |
| `meanHeartRate`    | Средний пульс (альт.) | bpm  |

### Бег

| type                         | Описание                | unit      |
| ---------------------------- | ----------------------- | --------- |
| `meanSpeed`                  | Средняя скорость        | m/s       |
| `meanCadence`                | Средний каденс          | spm       |
| `maxCadence`                 | Макс. каденс            | spm       |
| `averageRunningPower`        | Средняя мощность        | W         |
| `averageRunningSpeed`        | Средняя скорость бега   | m/s       |
| `averageRunningStrideLength` | Средняя длина шага      | m         |
| `averageVerticalOscillation` | Вертикальные колебания  | cm        |
| `averageGroundContactTime`   | Время контакта с землёй | ms        |
| `vo2Max`                     | VO2 Max                 | mL/kg/min |

### Высота

| type                 | Описание             | unit |
| -------------------- | -------------------- | ---- |
| `elevationAscended`  | Набор высоты         | m    |
| `elevationDescended` | Сброс высоты         | m    |
| `altitudeGain`       | Набор высоты (альт.) | m    |
| `altitudeLoss`       | Сброс высоты (альт.) | m    |
| `maxAltitude`        | Макс. высота         | m    |
| `minAltitude`        | Мин. высота          | m    |

### Скорость

| type           | Описание         | unit |
| -------------- | ---------------- | ---- |
| `averageSpeed` | Средняя скорость | m/s  |
| `maxSpeed`     | Макс. скорость   | m/s  |

### Прочее

| type                   | Описание       | unit |
| ---------------------- | -------------- | ---- |
| `averageMETs`          | Средний MET    | —    |
| `lapLength`            | Длина бассейна | m    |
| `swimmingLocationType` | Тип водоёма    | —    |
| `indoorWorkout`        | В помещении    | bool |
| `weatherTemperature`   | Температура    | °C   |
| `weatherHumidity`      | Влажность      | %    |

---

# Приложение В. SourceInfo — информация об устройстве

```json
{
  "appId": "com.sec.android.app.shealth",
  "name": "Samsung Health",
  "bundleIdentifier": null,
  "version": "6.27.0",
  "productType": null,
  "operatingSystemVersion": { "majorVersion": 14, "minorVersion": 0, "patchVersion": 0 },
  "deviceId": "R9ZW30ABC12",
  "deviceName": "Galaxy Watch7",
  "deviceManufacturer": "Samsung",
  "deviceType": "watch",
  "deviceModel": "SM-R960",
  "deviceHardwareVersion": null,
  "deviceSoftwareVersion": "5.0",
  "recordingMethod": "automatic"
}
```

### Поля

| Поле                     | Тип    | Описание                                       |
| ------------------------ | ------ | ---------------------------------------------- |
| `appId`                  | string | ID приложения                                  |
| `name`                   | string | Название приложения                            |
| `bundleIdentifier`       | string | Bundle ID (iOS)                                |
| `version`                | string | Версия приложения                              |
| `productType`            | string | Тип продукта                                   |
| `operatingSystemVersion` | object | `{ majorVersion, minorVersion, patchVersion }` |
| `deviceId`               | string | Уникальный ID устройства                       |
| `deviceName`             | string | Название устройства                            |
| `deviceManufacturer`     | string | Производитель                                  |
| `deviceType`             | string | Тип устройства (см. таблицу)                   |
| `deviceModel`            | string | Модель устройства                              |
| `deviceHardwareVersion`  | string | Версия оборудования                            |
| `deviceSoftwareVersion`  | string | Версия ПО устройства                           |
| `recordingMethod`        | string | Метод записи (см. таблицу)                     |

Все поля опциональны.

### Типы устройств (deviceType)

| Значение        | Описание              |
| --------------- | --------------------- |
| `phone`         | Телефон               |
| `watch`         | Умные часы            |
| `scale`         | Весы                  |
| `ring`          | Умное кольцо          |
| `fitness_band`  | Фитнес-браслет        |
| `chest_strap`   | Нагрудный датчик      |
| `head_mounted`  | Наголовное устройство |
| `smart_display` | Умный дисплей         |
| `unknown`       | Неизвестно            |

### Метод записи (recordingMethod)

| Значение    | Описание                                     |
| ----------- | -------------------------------------------- |
| `active`    | Активная запись (пользователь начал вручную) |
| `automatic` | Автоматическая запись                        |
| `manual`    | Ручной ввод                                  |
| `unknown`   | Неизвестно                                   |
