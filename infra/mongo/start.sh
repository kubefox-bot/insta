#!/bin/sh
set -eu
# Keyfile is generated once by the owning setup script; never recreate data.
cp /run/secrets/mongo_key /tmp/insta-mongo-key
chmod 400 /tmp/insta-mongo-key
chown mongodb:mongodb /tmp/insta-mongo-key
exec /usr/local/bin/docker-entrypoint.sh mongod --replSet rs0 --keyFile /tmp/insta-mongo-key --bind_ip_all --wiredTigerCacheSizeGB 0.25
