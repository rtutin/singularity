import os
import logging
from datetime import datetime

from sqlalchemy import create_engine, text
from web3 import Web3

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

DB_PATH = os.environ.get("DB_PATH", "/home/lain/random/singularity/backend/laravel/database/database.sqlite")
DEPLOYER_PK = os.environ.get("DEPLOYER_PK")
if not DEPLOYER_PK:
    raise ValueError("DEPLOYER_PK not set")

TOKEN_ADDRESS = "0x5847FB699d0923A9AEd7473ef5EA8ef0c2Cd05c8"
RPC_URL = "https://rpc.cyberia.church"
CHAIN_ID = 49406

TOKEN_ABI = [
    {
        "inputs": [
            {"name": "to", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "name": "mint",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
]

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
w3 = Web3(Web3.HTTPProvider(RPC_URL))
account = w3.eth.account.from_key(DEPLOYER_PK)
contract = w3.eth.contract(address=Web3.to_checksum_address(TOKEN_ADDRESS), abi=TOKEN_ABI)


def ensure_schema():
    """Create the tg_wallets table if it does not exist."""
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS tg_wallets (
                user_id  INTEGER PRIMARY KEY,
                address  TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """))


def mint_and_distribute():
    logger.info(f"Starting distribution at {datetime.now()}")

    ensure_schema()

    with engine.connect() as conn:
        wallets = conn.execute(text("SELECT user_id, address FROM tg_wallets")).fetchall()

    if not wallets:
        logger.info("No wallets to distribute to")
        return

    logger.info(f"Distributing to {len(wallets)} wallets")

    for user_id, address in wallets:
        try:
            checksum_addr = Web3.to_checksum_address(address)
            amount = 1 * 10**18

            tx = contract.functions.mint(checksum_addr, amount).build_transaction({
                "from": account.address,
                "nonce": w3.eth.get_transaction_count(account.address),
                "gas": 100000,
                "gasPrice": w3.eth.gas_price,
                "chainId": CHAIN_ID,
            })

            signed = account.sign_transaction(tx)
            tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

            logger.info(f"Minted 1 TG to {address} (tx: {tx_hash.hex()})")

        except Exception as e:
            logger.error(f"Failed to mint to {address}: {e}")

    logger.info("Distribution complete")


if __name__ == "__main__":
    mint_and_distribute()