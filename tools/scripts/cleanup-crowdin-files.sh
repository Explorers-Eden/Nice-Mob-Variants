#!/usr/bin/env bash
set -euo pipefail

rm -f .crowdin-temp.yml
rm -f assets/nice_mob_variants/lang/en_US.json
rm -f assets/nice_mob_variants/lang/en_MY.json
cp "$RUNNER_TEMP/crowdin-backup/en_us.json" assets/nice_mob_variants/lang/en_us.json
