#!/bin/sh
set -eu

ln -sf /etc/raddb/mods-available/sql /etc/raddb/mods-enabled/sql
radiusd -f
