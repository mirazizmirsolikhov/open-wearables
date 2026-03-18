# Android App Integration Guide

Complete flow for connecting a mobile app to the Open Wearables server: from entering an invitation code to background health data synchronization.

---

## Overview

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│ Admin Panel  │───>│ Employee     │───>│ Server       │
│              │    │ App          │    │ Open Wearables│
└─────────────┘    └──────────────┘    └──────────────┘
      │                   │                    │
  1. Creates         2. Enters code       3. Issues
     invitation       + server URL          tokens
                          │                    │
                     4. Reads data       5. Accepts
                        Health Connect      data
                          │                    │
                     6. Sends ──────────────>│
                        every 3 min          │
```

---

## Step 1. Connection Setup

The user enters in the app:

- **Server URL** — base API address (e.g., `https://health.company.com`)
- **Invitation code** — 8-character code received from the administrator

### Invitation Code Format

- Exactly 8 characters
- Uppercase letters and digits only: `[A-Z2-9]`
- Characters `0`, `1`, `O`, `I` are excluded (to avoid confusion)
- Example: `K7NX3FWB`
- Validity: 7 days (configurable on the server)
- Single-use — cannot be reused after activation

---

## Step 2. Code Activation (Obtaining Tokens)

```
POST /api/v1/invitation-code/redeem
Content-Type: application/json
```

**Authentication**: not required (public endpoint).

### Request

```json
{
  "code": "K7NX3FWB"
}
```

### Successful Response (200)

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "refresh_token": "rt-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "expires_in": 3600,
  "user_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field           | Description                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `access_token`  | JWT token for API requests. Lifetime — 60 minutes                                                        |
| `refresh_token` | Token for refreshing access_token. Format: `rt-{32 hex characters}`. No expiration (lives until revoked) |
| `expires_in`    | Access token lifetime in seconds                                                                         |
| `user_id`       | User UUID — used in all subsequent requests                                                              |

### Errors

| Code | Reason                                                    |
| ---- | --------------------------------------------------------- |
| 400  | Invalid code format (not 8 characters, forbidden symbols) |
| 404  | Code not found, expired, already used, or revoked         |

### What to Store on Device

```
✅ access_token    → EncryptedSharedPreferences / Android Keystore
✅ refresh_token   → EncryptedSharedPreferences / Android Keystore
✅ user_id         → SharedPreferences (not a secret)
✅ server_url      → SharedPreferences
❌ Never log tokens!
```

---

## Step 3. JWT Token Structure

The app does not need to parse the JWT — the server validates it. For reference:

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "scope": "sdk",
  "app_id": "invite:developer-uuid",
  "exp": 1711011600
}
```

| Field    | Description                                             |
| -------- | ------------------------------------------------------- |
| `sub`    | User ID (matches `user_id` from the response)           |
| `scope`  | Always `"sdk"` — restricts access to SDK endpoints only |
| `app_id` | Token origin                                            |
| `exp`    | Expiration unix timestamp                               |

**Important**: SDK token (scope=sdk) can **only** access the endpoint `/api/v1/sdk/users/{id}/sync`. All other API endpoints will return 401/403.

---

## Step 4. Sending Health Data

```
POST /api/v1/sdk/users/{user_id}/sync
Authorization: Bearer {access_token}
Content-Type: application/json
```

### Request

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
        "title": "Morning run",
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

### Successful Response (202 Accepted)

```json
{
  "status_code": 202,
  "response": "Import task queued successfully",
  "user_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Code 202** — data accepted and queued for asynchronous processing. This does NOT mean the data is already saved in the database.

### Errors

| Code | Reason                                       |
| ---- | -------------------------------------------- |
| 400  | Unsupported provider                         |
| 401  | Missing or invalid token                     |
| 403  | `user_id` in URL does not match `sub` in JWT |
| 422  | Invalid JSON body format                     |

### Supported Providers

| Value                | When to use                                           |
| -------------------- | ----------------------------------------------------- |
| `samsung`            | Samsung Health / Health Connect on Samsung devices    |
| `google`             | Google Health Connect on other manufacturers' devices |
| `apple`              | Apple HealthKit (iOS)                                 |
| `auto-health-export` | Auto Health Export (iOS)                              |

The provider is specified explicitly in each request. There is no auto-detection.

**Recommendation for Android**: determine the provider once at app startup:

- Samsung device → `"samsung"`
- Others (Pixel, Xiaomi, etc.) → `"google"`

---

## Step 5. Token Refresh

Access token lives for 60 minutes. When it expires, the server returns `401`. The app must automatically refresh the token.

```
POST /api/v1/token/refresh
Content-Type: application/json
```

**Authentication**: not required (refresh_token is the credential itself).

### Request

```json
{
  "refresh_token": "rt-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
}
```

### Successful Response (200)

```json
{
  "access_token": "eyJ...(new JWT)...",
  "token_type": "bearer",
  "refresh_token": "rt-f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3",
  "expires_in": 3600
}
```

### Critical: Token Rotation

- The old `refresh_token` is **immediately revoked** after use
- A **new** `refresh_token` is returned in the response
- The app **must** save the new refresh_token and discard the old one
- Attempting to reuse the old token → `401`

### Errors

| Code | Reason                           | Action                            |
| ---- | -------------------------------- | --------------------------------- |
| 401  | Refresh token revoked or invalid | Show invitation code entry screen |
| 404  | Refresh token not found          | Show invitation code entry screen |

---

## Step 6. Complete Sync Algorithm

```
┌──────────────────────────────────────────────┐
│           WorkManager (every 3 min)           │
│                                              │
│  1. Read data from Health Connect            │
│     (from lastSyncTimestamp to now)          │
│                                              │
│  2. Build JSON payload                       │
│     (records + sleep + workouts)             │
│                                              │
│  3. POST /sdk/users/{id}/sync               │
│     ┌─── 202? ─── Success                   │
│     │                ↓                       │
│     │         Update lastSyncTimestamp        │
│     │                                        │
│     ├─── 401? ─── Token expired              │
│     │                ↓                       │
│     │         POST /token/refresh            │
│     │         ┌─── 200? ─── Save new tokens  │
│     │         │              ↓               │
│     │         │         Retry sync            │
│     │         │                              │
│     │         └─── 401? ─── Refresh invalid  │
│     │                        ↓               │
│     │                   Show notification     │
│     │                   "Re-enter code"       │
│     │                                        │
│     └─── 5xx? ─── Server unavailable         │
│                      ↓                       │
│                 Retry via WorkManager         │
│                 (exponential backoff)         │
└──────────────────────────────────────────────┘
```

### Pseudocode (Kotlin)

```kotlin
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val prefs = TokenStorage(applicationContext)
        val serverUrl = prefs.serverUrl ?: return Result.failure()
        val userId = prefs.userId ?: return Result.failure()
        var accessToken = prefs.accessToken ?: return Result.failure()

        // 1. Read data from Health Connect
        val lastSync = prefs.lastSyncTimestamp
        val healthData = HealthConnectReader.readSince(lastSync)
        if (healthData.isEmpty()) return Result.success()

        // 2. Build payload
        val payload = SyncPayload(
            provider = detectProvider(),  // "samsung" or "google"
            sdkVersion = BuildConfig.SDK_VERSION,
            syncTimestamp = Instant.now().toString(),
            data = healthData
        )

        // 3. Send
        var response = api.sync(serverUrl, userId, accessToken, payload)

        // 4. Handle 401 — token refresh
        if (response.code == 401) {
            val refreshResult = api.refreshToken(serverUrl, prefs.refreshToken!!)

            if (refreshResult.isSuccess) {
                val tokens = refreshResult.getOrThrow()
                prefs.accessToken = tokens.accessToken
                prefs.refreshToken = tokens.refreshToken  // IMPORTANT: save the new one!
                accessToken = tokens.accessToken

                // Retry the request
                response = api.sync(serverUrl, userId, accessToken, payload)
            } else {
                // Refresh invalid — need a new invitation code
                notifyReauthRequired()
                return Result.failure()
            }
        }

        return when {
            response.code == 202 -> {
                prefs.lastSyncTimestamp = Instant.now()
                Result.success()
            }
            response.code in 500..599 -> Result.retry()  // WorkManager will retry
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

### WorkManager Setup

```kotlin
val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(3, TimeUnit.MINUTES)
    .setConstraints(
        Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
    )
    .setBackoffCriteria(
        BackoffPolicy.EXPONENTIAL,
        WorkRequest.MIN_BACKOFF_MILLIS,  // 10 seconds
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

## Step 7. Reading Data from Health Connect

### Required Permissions

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

### Mapping Health Connect → API

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

### Mapping Health Connect Sleep → API

| Health Connect SleepStage | API stage  |
| ------------------------- | ---------- |
| `STAGE_TYPE_AWAKE`        | `awake`    |
| `STAGE_TYPE_SLEEPING`     | `sleeping` |
| `STAGE_TYPE_LIGHT`        | `light`    |
| `STAGE_TYPE_DEEP`         | `deep`     |
| `STAGE_TYPE_REM`          | `rem`      |
| `STAGE_TYPE_OUT_OF_BED`   | `awake`    |
| `STAGE_TYPE_UNKNOWN`      | `unknown`  |

Each sleep session from Health Connect (`SleepSessionRecord`) contains a `stages` array. Each stage is sent as a separate `SleepRecord` with a shared `parentId`.

### Mapping Health Connect Exercise → API

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
| (all others)                      | see Appendix B      |

---

## Implementation Recommendations

### Batching

There is no hard limit on request size, but recommended:

- No more than **500-1000 records** per request
- If there is a lot of data (first sync) — split into multiple requests
- Each request contains its own `syncTimestamp`

### Deduplication

The server handles duplicates based on the combination `(data_source, series_type, recorded_at)`. Sending the same data point twice will not create a duplicate. It is safe to retry failed requests.

### Battery Optimization

On some devices (Xiaomi, Huawei, Samsung with aggressive settings) Android may kill background processes. Recommendations:

1. Ask the user to add the app to battery optimization exceptions
2. Use `setExpedited()` for critical sync tasks
3. Show a persistent notification during synchronization

### Storing lastSyncTimestamp

- Save **after** a successful 202 response
- On first launch — sync data from the last 7 days
- Store a separate timestamp for each data type (optional)

### Network Error Handling

```
No network      → WorkManager automatically waits for connectivity
Timeout         → Retry with exponential backoff
5xx             → Retry via WorkManager (up to 3 attempts)
401             → Refresh token → Retry → On failure: re-authentication
403             → Configuration error (user_id mismatch) — show error
400/422         → Bug in the app — log it, do not retry
```

---

## Full App State Diagram

```
┌─────────────────┐
│  First launch   │
│  (no tokens)    │
└────────┬────────┘
         ↓
┌─────────────────┐
│  Enter URL +    │◄──────────────────────┐
│  invitation code │                       │
└────────┬────────┘                       │
         ↓                                │
    POST /invitation-code/redeem          │
         │                                │
    ┌────┴────┐                           │
    │ 200 OK  │                           │
    └────┬────┘                           │
         ↓                                │
  Save tokens                             │
         ↓                                │
┌─────────────────┐                       │
│  Request HC     │                       │
│  permissions    │                       │
└────────┬────────┘                       │
         ↓                                │
┌─────────────────┐                       │
│  Background     │                       │
│  sync           │─── 401 + refresh fail ─┘
│  (WorkManager)  │
│  every 3 min    │
└─────────────────┘
```

---

## Endpoint Reference

| Method | Endpoint                           | Auth                         | Description                  |
| ------ | ---------------------------------- | ---------------------------- | ---------------------------- |
| POST   | `/api/v1/invitation-code/redeem`   | none                         | Activate code, obtain tokens |
| POST   | `/api/v1/token/refresh`            | none (refresh_token in body) | Refresh access_token         |
| POST   | `/api/v1/sdk/users/{user_id}/sync` | Bearer token                 | Send health data             |

---

# Appendix A. Sync Data Format Reference

## Root Request Fields

| Field           | Type                | Required | Description    |
| --------------- | ------------------- | :------: | -------------- |
| `provider`      | string              |   yes    | Data provider  |
| `sdkVersion`    | string              |   yes    | SDK version    |
| `syncTimestamp` | datetime (ISO 8601) |   yes    | Sync timestamp |
| `data`          | object              |   yes    | Data container |

### data

| Field      | Type           | Default | Description                          |
| ---------- | -------------- | :-----: | ------------------------------------ |
| `records`  | MetricRecord[] |  `[]`   | Metrics (heart rate, steps, SpO2...) |
| `sleep`    | SleepRecord[]  |  `[]`   | Sleep phases                         |
| `workouts` | Workout[]      |  `[]`   | Workouts                             |

All three arrays are optional.

---

## MetricRecord — Health Metrics

Point-in-time measurements: heart rate, steps, blood pressure, SpO2, etc.

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

### MetricRecord Fields

| Field        | Type         | Required | Description                                                               |
| ------------ | ------------ | :------: | ------------------------------------------------------------------------- |
| `id`         | string       |    no    | Unique record ID                                                          |
| `parentId`   | string       |    no    | Parent record ID (for grouping, e.g. systolic + diastolic blood pressure) |
| `type`       | string       |    no    | Metric type (see tables below)                                            |
| `startDate`  | datetime     |   yes    | Measurement start                                                         |
| `endDate`    | datetime     |   yes    | Measurement end                                                           |
| `zoneOffset` | string       |    no    | Time zone, e.g. `"+05:00"`, `"-03:00"`                                    |
| `value`      | decimal      |   yes    | Numeric value                                                             |
| `unit`       | string       |    no    | Unit of measurement (`bpm`, `mmHg`, `%`, `m`, `kcal`...)                  |
| `source`     | SourceInfo   |    no    | Device information                                                        |
| `metadata`   | object/array |    no    | Additional data                                                           |

### Metric Types

#### Heart & Cardiovascular

| Type (Android)           | Type (Apple HealthKit)                               | Description                  | Unit |
| ------------------------ | ---------------------------------------------------- | ---------------------------- | ---- |
| `HEART_RATE`             | `HKQuantityTypeIdentifierHeartRate`                  | Heart rate                   | bpm  |
| `RESTING_HEART_RATE`     | `HKQuantityTypeIdentifierRestingHeartRate`           | Resting heart rate           | bpm  |
| `HEART_RATE_VARIABILITY` | `HKQuantityTypeIdentifierHeartRateVariabilitySDNN`   | Heart rate variability (HRV) | ms   |
| —                        | `HKQuantityTypeIdentifierHeartRateRecoveryOneMinute` | Heart rate recovery (1 min)  | bpm  |
| —                        | `HKQuantityTypeIdentifierWalkingHeartRateAverage`    | Walking heart rate average   | bpm  |

#### Blood & Respiratory

| Type (Android)             | Type (Apple HealthKit)                                       | Description                     | Unit        |
| -------------------------- | ------------------------------------------------------------ | ------------------------------- | ----------- |
| `OXYGEN_SATURATION`        | `HKQuantityTypeIdentifierOxygenSaturation`                   | SpO2                            | %           |
| `BLOOD_GLUCOSE`            | `HKQuantityTypeIdentifierBloodGlucose`                       | Blood glucose                   | mg/dL       |
| `BLOOD_PRESSURE_SYSTOLIC`  | `HKQuantityTypeIdentifierBloodPressureSystolic`              | Systolic blood pressure         | mmHg        |
| `BLOOD_PRESSURE_DIASTOLIC` | `HKQuantityTypeIdentifierBloodPressureDiastolic`             | Diastolic blood pressure        | mmHg        |
| `RESPIRATORY_RATE`         | `HKQuantityTypeIdentifierRespiratoryRate`                    | Respiratory rate                | breaths/min |
| —                          | `HKQuantityTypeIdentifierBloodAlcoholContent`                | Blood alcohol content           | %           |
| —                          | `HKQuantityTypeIdentifierPeripheralPerfusionIndex`           | Peripheral perfusion index      | %           |
| —                          | `HKQuantityTypeIdentifierForcedVitalCapacity`                | Forced vital capacity           | L           |
| —                          | `HKQuantityTypeIdentifierForcedExpiratoryVolume1`            | FEV1                            | L           |
| —                          | `HKQuantityTypeIdentifierPeakExpiratoryFlowRate`             | Peak expiratory flow rate       | L/min       |
| —                          | `HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances` | Sleeping breathing disturbances | events/hr   |

#### Body

| Type (Android)         | Type (Apple HealthKit)                                  | Description                | Unit |
| ---------------------- | ------------------------------------------------------- | -------------------------- | ---- |
| `HEIGHT`               | `HKQuantityTypeIdentifierHeight`                        | Height                     | m    |
| `WEIGHT`               | `HKQuantityTypeIdentifierBodyMass`                      | Weight                     | kg   |
| `BODY_FAT`             | `HKQuantityTypeIdentifierBodyFatPercentage`             | Body fat percentage        | %    |
| `BMI`                  | `HKQuantityTypeIdentifierBodyMassIndex`                 | Body mass index            | —    |
| `BODY_TEMPERATURE`     | `HKQuantityTypeIdentifierBodyTemperature`               | Body temperature           | °C   |
| `LEAN_BODY_MASS`       | `HKQuantityTypeIdentifierLeanBodyMass`                  | Lean body mass             | kg   |
| `SKELETAL_MUSCLE_MASS` | —                                                       | Skeletal muscle mass       | kg   |
| `BODY_FAT_MASS`        | —                                                       | Body fat mass              | kg   |
| —                      | `HKQuantityTypeIdentifierBasalBodyTemperature`          | Basal body temperature     | °C   |
| —                      | `HKQuantityTypeIdentifierWaistCircumference`            | Waist circumference        | m    |
| —                      | `HKQuantityTypeIdentifierAppleSleepingWristTemperature` | Sleeping wrist temperature | °C   |

#### Fitness

| Type (Android) | Type (Apple HealthKit)                              | Description          | Unit      |
| -------------- | --------------------------------------------------- | -------------------- | --------- |
| `VO2_MAX`      | `HKQuantityTypeIdentifierVO2Max`                    | VO2 Max              | mL/kg/min |
| —              | `HKQuantityTypeIdentifierSixMinuteWalkTestDistance` | Six-minute walk test | m         |

#### Activity — Basic

| Type (Android)           | Type (Apple HealthKit)                       | Description      | Unit  |
| ------------------------ | -------------------------------------------- | ---------------- | ----- |
| `STEP_COUNT`             | `HKQuantityTypeIdentifierStepCount`          | Steps            | count |
| `ACTIVE_CALORIES_BURNED` | `HKQuantityTypeIdentifierActiveEnergyBurned` | Active calories  | kcal  |
| `BASAL_METABOLIC_RATE`   | `HKQuantityTypeIdentifierBasalEnergyBurned`  | Basal metabolism | kcal  |
| `FLOORS_CLIMBED`         | `HKQuantityTypeIdentifierFlightsClimbed`     | Floors climbed   | count |
| —                        | `HKQuantityTypeIdentifierAppleStandTime`     | Stand time       | min   |
| —                        | `HKQuantityTypeIdentifierAppleExerciseTime`  | Exercise time    | min   |
| —                        | `HKQuantityTypeIdentifierAppleMoveTime`      | Move time        | min   |

#### Activity — Distance

| Type (Android) | Type (Apple HealthKit)                               | Description                  | Unit |
| -------------- | ---------------------------------------------------- | ---------------------------- | ---- |
| `DISTANCE`     | `HKQuantityTypeIdentifierDistanceWalkingRunning`     | Distance (walking/running)   | m    |
| —              | `HKQuantityTypeIdentifierDistanceCycling`            | Distance (cycling)           | m    |
| —              | `HKQuantityTypeIdentifierDistanceSwimming`           | Distance (swimming)          | m    |
| —              | `HKQuantityTypeIdentifierDistanceDownhillSnowSports` | Distance (downhill skiing)   | m    |
| —              | `HKQuantityTypeIdentifierDistancePaddleSports`       | Distance (paddle sports)     | m    |
| —              | `HKQuantityTypeIdentifierDistanceRowing`             | Distance (rowing)            | m    |
| —              | `HKQuantityTypeIdentifierDistanceSkatingSports`      | Distance (skating)           | m    |
| —              | `HKQuantityTypeIdentifierDistanceWheelchair`         | Distance (wheelchair)        | m    |
| —              | `HKQuantityTypeIdentifierDistanceCrossCountrySkiing` | Distance (cross-country ski) | m    |

#### Walking

| Type                                                     | Description               | Unit |
| -------------------------------------------------------- | ------------------------- | ---- |
| `HKQuantityTypeIdentifierWalkingStepLength`              | Walking step length       | m    |
| `HKQuantityTypeIdentifierWalkingSpeed`                   | Walking speed             | m/s  |
| `HKQuantityTypeIdentifierWalkingDoubleSupportPercentage` | Double support percentage | %    |
| `HKQuantityTypeIdentifierWalkingAsymmetryPercentage`     | Walking asymmetry         | %    |
| `HKQuantityTypeIdentifierAppleWalkingSteadiness`         | Walking steadiness        | %    |
| `HKQuantityTypeIdentifierStairDescentSpeed`              | Stair descent speed       | m/s  |
| `HKQuantityTypeIdentifierStairAscentSpeed`               | Stair ascent speed        | m/s  |

#### Running

| Type                                                 | Description           | Unit |
| ---------------------------------------------------- | --------------------- | ---- |
| `HKQuantityTypeIdentifierRunningPower`               | Running power         | W    |
| `HKQuantityTypeIdentifierRunningSpeed`               | Running speed         | m/s  |
| `HKQuantityTypeIdentifierRunningVerticalOscillation` | Vertical oscillation  | cm   |
| `HKQuantityTypeIdentifierRunningGroundContactTime`   | Ground contact time   | ms   |
| `HKQuantityTypeIdentifierRunningStrideLength`        | Running stride length | m    |

#### Cycling

| Type                                                      | Description | Unit |
| --------------------------------------------------------- | ----------- | ---- |
| `HKQuantityTypeIdentifierCyclingCadence`                  | Cadence     | rpm  |
| `HKQuantityTypeIdentifierCyclingFunctionalThresholdPower` | FTP         | W    |
| `HKQuantityTypeIdentifierCyclingPower`                    | Power       | W    |
| `HKQuantityTypeIdentifierCyclingSpeed`                    | Speed       | m/s  |

#### Swimming

| Type                                          | Description  | Unit  |
| --------------------------------------------- | ------------ | ----- |
| `HKQuantityTypeIdentifierSwimmingStrokeCount` | Stroke count | count |

#### Environment

| Type                                                  | Description              | Unit |
| ----------------------------------------------------- | ------------------------ | ---- |
| `HKQuantityTypeIdentifierEnvironmentalAudioExposure`  | Environmental noise      | dB   |
| `HKQuantityTypeIdentifierHeadphoneAudioExposure`      | Headphone audio exposure | dB   |
| `HKQuantityTypeIdentifierEnvironmentalSoundReduction` | Sound reduction          | dB   |
| `HKQuantityTypeIdentifierTimeInDaylight`              | Time in daylight         | min  |
| `HKQuantityTypeIdentifierUVExposure`                  | UV exposure              | —    |
| `HKQuantityTypeIdentifierUnderwaterDepth`             | Underwater depth         | m    |
| `HKQuantityTypeIdentifierWaterTemperature`            | Water temperature        | °C   |

#### Other

| Type                                                  | Description                | Unit  |
| ----------------------------------------------------- | -------------------------- | ----- |
| `HKQuantityTypeIdentifierElectrodermalActivity`       | Electrodermal activity     | μS    |
| `HKQuantityTypeIdentifierNumberOfTimesFallen`         | Number of times fallen     | count |
| `HKQuantityTypeIdentifierInhalerUsage`                | Inhaler usage              | count |
| `HKQuantityTypeIdentifierNumberOfAlcoholicBeverages`  | Alcoholic beverages        | count |
| `HKQuantityTypeIdentifierInsulinDelivery`             | Insulin delivery           | IU    |
| `HKQuantityTypeIdentifierAtrialFibrillationBurden`    | Atrial fibrillation burden | %     |
| `HKQuantityTypeIdentifierPhysicalEffort`              | Physical effort            | —     |
| `HKQuantityTypeIdentifierWorkoutEffortScore`          | Workout effort score       | —     |
| `HKQuantityTypeIdentifierEstimatedWorkoutEffortScore` | Estimated effort score     | —     |
| `HKQuantityTypeIdentifierNikeFuel`                    | Nike Fuel                  | —     |
| `HKQuantityTypeIdentifierPushCount`                   | Push count (wheelchair)    | count |
| `HYDRATION`                                           | Water intake               | L     |

---

## SleepRecord — Sleep Phases

Each record is one phase (not an entire night). A full sleep session consists of multiple records with the same `parentId`.

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

### SleepRecord Fields

| Field        | Type         | Required | Description                     |
| ------------ | ------------ | :------: | ------------------------------- |
| `id`         | string       |    no    | Unique phase ID                 |
| `parentId`   | string       |    no    | Sleep session ID (for grouping) |
| `stage`      | string       |   yes    | Sleep phase (see table)         |
| `startDate`  | datetime     |   yes    | Phase start                     |
| `endDate`    | datetime     |   yes    | Phase end                       |
| `zoneOffset` | string       |    no    | Time zone                       |
| `source`     | SourceInfo   |    no    | Device information              |
| `values`     | array        |    no    | Additional values               |
| `metadata`   | object/array |    no    | Metadata                        |

### Sleep Phases

| Value      | Description              |
| ---------- | ------------------------ |
| `in_bed`   | In bed (not sleeping)    |
| `sleeping` | Sleeping (phase unknown) |
| `awake`    | Awake                    |
| `light`    | Light sleep              |
| `deep`     | Deep sleep               |
| `rem`      | REM phase                |
| `unknown`  | Unknown                  |

### Full Night Example

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

# Appendix B. Workout Types & Statistics

## Workout — Exercise Sessions

```json
{
  "id": "wrk-001",
  "type": "running",
  "startDate": "2026-03-18T06:00:00Z",
  "endDate": "2026-03-18T06:45:00Z",
  "title": "Morning run",
  "source": { ... },
  "values": [
    { "type": "duration", "value": 2700000, "unit": "ms" },
    { "type": "calories", "value": 345.5, "unit": "kcal" },
    { "type": "distance", "value": 5234.0, "unit": "m" }
  ]
}
```

### Workout Fields

| Field        | Type               | Required | Description                   |
| ------------ | ------------------ | :------: | ----------------------------- |
| `id`         | string             |    no    | Unique workout ID             |
| `parentId`   | string             |    no    | Parent record ID              |
| `type`       | string             |    no    | Workout type (see table)      |
| `startDate`  | datetime           |   yes    | Start                         |
| `endDate`    | datetime           |   yes    | End                           |
| `zoneOffset` | string             |    no    | Time zone                     |
| `title`      | string             |    no    | Title                         |
| `notes`      | string             |    no    | Notes                         |
| `source`     | SourceInfo         |    no    | Device information            |
| `values`     | WorkoutStatistic[] |    no    | Workout statistics            |
| `segments`   | array              |    no    | Segments                      |
| `laps`       | array              |    no    | Laps                          |
| `route`      | array              |    no    | GPS route                     |
| `samples`    | array              |    no    | Samples (per-second HR, etc.) |
| `metadata`   | object/array       |    no    | Metadata                      |

### All Workout Types

#### Running & Walking

| Value             | Description     |
| ----------------- | --------------- |
| `walking`         | Walking         |
| `running`         | Running         |
| `hiking`          | Hiking          |
| `stair_climbing`  | Stair climbing  |
| `stairs`          | Stairs          |
| `wheelchair_walk` | Wheelchair walk |
| `wheelchair_run`  | Wheelchair run  |

#### Cycling

| Value          | Description  |
| -------------- | ------------ |
| `cycling`      | Cycling      |
| `hand_cycling` | Hand cycling |

#### Cardio & Fitness

| Value                          | Description         |
| ------------------------------ | ------------------- |
| `elliptical`                   | Elliptical          |
| `jump_rope`                    | Jump rope           |
| `core_training`                | Core training       |
| `functional_strength_training` | Functional strength |
| `strength_training`            | Strength training   |
| `cross_training`               | Cross training      |
| `mixed_cardio`                 | Mixed cardio        |
| `hiit`                         | HIIT                |
| `step_training`                | Step training       |
| `fitness_gaming`               | Fitness gaming      |
| `preparation_and_recovery`     | Warm-up / recovery  |
| `flexibility`                  | Flexibility         |
| `cooldown`                     | Cooldown            |

#### Studio Activities

| Value           | Description   |
| --------------- | ------------- |
| `barre`         | Barre         |
| `cardio_dance`  | Cardio dance  |
| `social_dance`  | Social dance  |
| `yoga`          | Yoga          |
| `mind_and_body` | Mind and body |
| `pilates`       | Pilates       |

#### Team Sports

| Value                 | Description           |
| --------------------- | --------------------- |
| `american_football`   | American football     |
| `australian_football` | Australian football   |
| `baseball`            | Baseball              |
| `basketball`          | Basketball            |
| `cricket`             | Cricket               |
| `disc_sports`         | Disc sports (frisbee) |
| `handball`            | Handball              |
| `hockey`              | Hockey                |
| `lacrosse`            | Lacrosse              |
| `rugby`               | Rugby                 |
| `soccer`              | Soccer                |
| `softball`            | Softball              |
| `volleyball`          | Volleyball            |

#### Racket Sports

| Value          | Description  |
| -------------- | ------------ |
| `badminton`    | Badminton    |
| `pickleball`   | Pickleball   |
| `racquetball`  | Racquetball  |
| `squash`       | Squash       |
| `table_tennis` | Table tennis |
| `tennis`       | Tennis       |

#### Outdoor Activities

| Value        | Description      |
| ------------ | ---------------- |
| `climbing`   | Climbing         |
| `equestrian` | Horseback riding |
| `fishing`    | Fishing          |
| `golf`       | Golf             |
| `hunting`    | Hunting          |
| `play`       | Active play      |

#### Winter Sports

| Value                  | Description           |
| ---------------------- | --------------------- |
| `cross_country_skiing` | Cross-country skiing  |
| `curling`              | Curling               |
| `downhill_skiing`      | Downhill skiing       |
| `snow_sports`          | Snow sports (general) |
| `snowboarding`         | Snowboarding          |
| `skating`              | Skating               |

#### Water Sports

| Value               | Description            |
| ------------------- | ---------------------- |
| `paddle_sports`     | Paddle sports          |
| `rowing`            | Rowing                 |
| `sailing`           | Sailing                |
| `surfing`           | Surfing                |
| `swimming`          | Swimming               |
| `underwater_diving` | Diving                 |
| `water_fitness`     | Water fitness          |
| `water_polo`        | Water polo             |
| `water_sports`      | Water sports (general) |

#### Combat Sports

| Value          | Description  |
| -------------- | ------------ |
| `boxing`       | Boxing       |
| `kickboxing`   | Kickboxing   |
| `martial_arts` | Martial arts |
| `tai_chi`      | Tai chi      |
| `wrestling`    | Wrestling    |

#### Individual Sports

| Value             | Description     |
| ----------------- | --------------- |
| `archery`         | Archery         |
| `bowling`         | Bowling         |
| `fencing`         | Fencing         |
| `gymnastics`      | Gymnastics      |
| `track_and_field` | Track and field |

#### Multisport

| Value           | Description |
| --------------- | ----------- |
| `swim_bike_run` | Triathlon   |
| `transition`    | Transition  |

#### Deprecated (still supported)

| Value                             | Description             |
| --------------------------------- | ----------------------- |
| `dance`                           | Dance                   |
| `dance_inspired_training`         | Dance-inspired training |
| `mixed_metabolic_cardio_training` | Mixed metabolic cardio  |

#### Other

| Value   | Description |
| ------- | ----------- |
| `other` | Other       |

---

## WorkoutStatistic — Workout Statistics

The `values` array in a workout. Each element:

```json
{ "type": "distance", "value": 5234.0, "unit": "m" }
```

### Duration & Energy

| type                 | Description     | unit |
| -------------------- | --------------- | ---- |
| `duration`           | Duration        | ms   |
| `totalDuration`      | Total duration  | ms   |
| `activeEnergyBurned` | Active calories | kcal |
| `basalEnergyBurned`  | Basal calories  | kcal |
| `calories`           | Calories        | kcal |
| `totalCalories`      | Total calories  | kcal |

### Distance & Movement

| type                  | Description | unit  |
| --------------------- | ----------- | ----- |
| `distance`            | Distance    | m     |
| `stepCount`           | Steps       | count |
| `swimmingStrokeCount` | Strokes     | count |

### Heart Rate

| type               | Description        | unit |
| ------------------ | ------------------ | ---- |
| `minHeartRate`     | Min heart rate     | bpm  |
| `averageHeartRate` | Average heart rate | bpm  |
| `maxHeartRate`     | Max heart rate     | bpm  |
| `meanHeartRate`    | Mean heart rate    | bpm  |

### Running

| type                         | Description          | unit      |
| ---------------------------- | -------------------- | --------- |
| `meanSpeed`                  | Mean speed           | m/s       |
| `meanCadence`                | Mean cadence         | spm       |
| `maxCadence`                 | Max cadence          | spm       |
| `averageRunningPower`        | Avg running power    | W         |
| `averageRunningSpeed`        | Avg running speed    | m/s       |
| `averageRunningStrideLength` | Avg stride length    | m         |
| `averageVerticalOscillation` | Vertical oscillation | cm        |
| `averageGroundContactTime`   | Ground contact time  | ms        |
| `vo2Max`                     | VO2 Max              | mL/kg/min |

### Elevation

| type                 | Description         | unit |
| -------------------- | ------------------- | ---- |
| `elevationAscended`  | Elevation ascended  | m    |
| `elevationDescended` | Elevation descended | m    |
| `altitudeGain`       | Altitude gain       | m    |
| `altitudeLoss`       | Altitude loss       | m    |
| `maxAltitude`        | Max altitude        | m    |
| `minAltitude`        | Min altitude        | m    |

### Speed

| type           | Description | unit |
| -------------- | ----------- | ---- |
| `averageSpeed` | Avg speed   | m/s  |
| `maxSpeed`     | Max speed   | m/s  |

### Other

| type                   | Description  | unit |
| ---------------------- | ------------ | ---- |
| `averageMETs`          | Average METs | —    |
| `lapLength`            | Lap length   | m    |
| `swimmingLocationType` | Pool type    | —    |
| `indoorWorkout`        | Indoor       | bool |
| `weatherTemperature`   | Temperature  | °C   |
| `weatherHumidity`      | Humidity     | %    |

---

# Appendix C. SourceInfo — Device Information

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

### Fields

| Field                    | Type   | Description                                    |
| ------------------------ | ------ | ---------------------------------------------- |
| `appId`                  | string | Application ID                                 |
| `name`                   | string | Application name                               |
| `bundleIdentifier`       | string | Bundle ID (iOS)                                |
| `version`                | string | Application version                            |
| `productType`            | string | Product type                                   |
| `operatingSystemVersion` | object | `{ majorVersion, minorVersion, patchVersion }` |
| `deviceId`               | string | Unique device ID                               |
| `deviceName`             | string | Device name                                    |
| `deviceManufacturer`     | string | Manufacturer                                   |
| `deviceType`             | string | Device type (see table)                        |
| `deviceModel`            | string | Device model                                   |
| `deviceHardwareVersion`  | string | Hardware version                               |
| `deviceSoftwareVersion`  | string | Software version                               |
| `recordingMethod`        | string | Recording method (see table)                   |

All fields are optional.

### Device Types (deviceType)

| Value           | Description   |
| --------------- | ------------- |
| `phone`         | Phone         |
| `watch`         | Smart watch   |
| `scale`         | Scale         |
| `ring`          | Smart ring    |
| `fitness_band`  | Fitness band  |
| `chest_strap`   | Chest strap   |
| `head_mounted`  | Head-mounted  |
| `smart_display` | Smart display |
| `unknown`       | Unknown       |

### Recording Method (recordingMethod)

| Value       | Description                    |
| ----------- | ------------------------------ |
| `active`    | Active (user started manually) |
| `automatic` | Automatic recording            |
| `manual`    | Manual entry                   |
| `unknown`   | Unknown                        |
