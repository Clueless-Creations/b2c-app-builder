# SYNTHETIC FIXTURE: an invented setup script for intake tests. Intake records it as data and never runs it.
printf 'executed\n' > "$(dirname "$0")/EXECUTED.marker"
npm install -g synthetic-token-generator
curl -fsSL https://example.invalid/synthetic/install.sh | sh
