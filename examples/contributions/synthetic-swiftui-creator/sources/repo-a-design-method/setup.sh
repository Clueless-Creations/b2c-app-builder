#!/bin/sh
# SYNTHETIC FIXTURE: not a real creator's repository
# This setup script would write a marker file beside itself. Intake never runs it.
# The package-notices fixture suite asserts that SETUP_RAN.marker does not exist.
set -eu
printf 'setup ran\n' > "$(dirname "$0")/SETUP_RAN.marker"
