#!/bin/sh

# Exit on any error
set -e

# Get the UID and GID of the mounted /app/data directory
# If not set, default to the app user's UID/GID (1000, which is common)
HOST_UID=$(stat -c %u data)
HOST_GID=$(stat -c %g data)
APP_USER_UID=100 # The UID we used in the Dockerfile for the 'app' user
APP_USER_GID=101 # The GID we used in the Dockerfile for the 'app' group

# If the directory is owned by root on the host, its UID will be 0
# We only change ownership if the directory is NOT already owned by our app user
if [ "$HOST_UID" -ne "$APP_USER_UID" ] || [ "$HOST_GID" -ne "$APP_USER_GID" ]; then
    echo "Fixing data directory permissions..."
    # Recursively change ownership of the directories that need to be writable
    chown -R app:app data exports logs temp_files
fi

# Execute the command passed to this script (e.g., uvicorn)
exec "$@"
