#!/bin/bash
set -e -x

celery -A app.main:celery_app worker --loglevel=info --pool=threads -Q default,sdk_sync
