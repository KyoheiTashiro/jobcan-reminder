#!/bin/bash
set -e

PLIST_NAME="com.jobcan-reminder.plist"
PROJECT_DIR="/Users/tashirokyoutaira/projects/private/jobcan-reminder"
DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"

# Unload existing if present
if launchctl list | grep -q "com.jobcan-reminder"; then
  echo "Unloading existing job..."
  launchctl unload "$DEST" 2>/dev/null || true
fi

# Copy plist
cp "$PROJECT_DIR/$PLIST_NAME" "$DEST"
echo "Plist copied to $DEST"

# Load
launchctl load "$DEST"
echo "Job loaded successfully!"
echo ""
echo "Verify with: launchctl list | grep jobcan"
echo "Unload with: launchctl unload $DEST"
