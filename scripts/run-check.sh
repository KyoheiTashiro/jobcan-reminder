#!/bin/bash
HOUR=$(date +%H)
if [ "$HOUR" -lt 15 ]; then
  CHECK_TYPE="punch_in"
else
  CHECK_TYPE="punch_out"
fi

cd /Users/tashirokyoutaira/projects/private/jobcan-reminder
/usr/local/bin/node src/index.js --check-type "$CHECK_TYPE"
