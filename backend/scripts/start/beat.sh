#!/bin/bash
set -e -x

rm -f './celerybeat.pid'
celery -A app.main:celery_app beat -l info
