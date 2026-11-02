#!/bin/bash
cd "$(dirname "$0")"
export ADMIN_EMAIL=admin@horabela.local ADMIN_PASSWORD=TroqueEstaSenha123
open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null &
node --disable-warning=ExperimentalWarning src/server.js
