#!/usr/bin/env bash
set -eu
cp -R "$(dirname "$0")/files/." .
cd repo && git init -q && git add README.md && git -c user.name=test -c user.email=test@example.com commit -q -m 'start'
