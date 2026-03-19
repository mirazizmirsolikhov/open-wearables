#!/bin/bash
set -e -x

# Init database
echo 'Applying migrations...'
alembic upgrade head

# Initialize provider settings
echo 'Initializing provider settings...'
python scripts/init_provider_settings.py

# Initialize device priority table
echo 'Initializing priorities...'
python scripts/init_device_priorities.py

# Seed admin account (uses ADMIN_EMAIL/ADMIN_PASSWORD env vars, or defaults)
echo 'Seeding admin account...'
python scripts/init/seed_admin.py

# Initialize series type definitions
echo 'Initializing series type definitions...'
python scripts/init/seed_series_types.py

# Init app
echo "Starting the FastAPI application..."
if [ "$ENVIRONMENT" = "local" ]; then
    fastapi dev app/main.py --host 0.0.0.0 --port 8000
else
    fastapi run app/main.py --host 0.0.0.0 --port 8000
fi
