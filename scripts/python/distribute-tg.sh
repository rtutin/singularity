#!/bin/bash
cd /home/lain/random/singularity/scripts/python
source /home/lain/random/.venv/bin/activate
export DB_PATH="/home/lain/random/singularity/backend/laravel/database/database.sqlite"
export DEPLOYER_PK=$(grep DEPLOYER_PK /home/lain/random/singularity/hardhat/.env | cut -d= -f2)
python distribute_tg.py