import os
import time
import logging
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
from telegram.error import TelegramError
from telegram.request import HTTPXRequest

from sqlalchemy import create_engine, text

load_dotenv(Path(__file__).parent / ".env")

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
if not TELEGRAM_BOT_TOKEN:
    raise ValueError("TELEGRAM_BOT_TOKEN not set")

CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")
HTTP_PROXY = os.environ.get("HTTP_PROXY")

DB_PATH = os.environ.get("DB_PATH", "/home/lain/random/singularity/backend/laravel/database/database.sqlite")

TOKEN_ADDRESS = "0x02Bad7dCaD174D92FCE2baBBd0cE1A653b487f04"
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
        "inputs": [],
        "name": "symbol",
        "outputs": [{"name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function",
    },
]

RPC_URL = "http://195.166.164.94:8545"
CHAIN_ID = 49406

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)

logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("telegram").setLevel(logging.WARNING)

class SecurityFilter(logging.Filter):
    def filter(self, record):
        record.msg = record.msg.replace(TELEGRAM_BOT_TOKEN, "***")
        return True
logger = logging.getLogger(__name__)
logger.addFilter(SecurityFilter())

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


def is_valid_eth_address(address: str) -> bool:
    return address.startswith("0x") and len(address) == 42


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Hi! I'll send you 1 TG token every hour on Cyberia (49406). "
        "Use /set_wallet <address> to register.\n\n"
        "Example: /set_wallet 0x1234567890abcdef1234567890abcdef12345678"
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Commands:\n"
        "/start - start receiving TG\n"
        "/set_wallet <address> - set your wallet\n"
        "/stop - stop receiving\n"
        "/balance - check balance"
    )


async def set_wallet_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if not args:
        await update.message.reply_text("Usage: /set_wallet <address>\nExample: /set_wallet 0x1234...")
        return

    address = args[0].strip()
    user_id = update.effective_user.id

    if not is_valid_eth_address(address):
        await update.message.reply_text("Invalid address format. Expected 0x...")
        return

    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT address FROM tg_wallets WHERE user_id = :user_id"),
            {"user_id": user_id},
        ).fetchone()

        if result:
            conn.execute(
                text("UPDATE tg_wallets SET address = :address WHERE user_id = :user_id"),
                {"address": address, "user_id": user_id},
            )
            msg = f"Address updated: {address}"
        else:
            conn.execute(
                text("INSERT INTO tg_wallets (user_id, address) VALUES (:user_id, :address)"),
                {"user_id": user_id, "address": address},
            )
            msg = f"Address saved: {address}. You'll receive 1 TG every hour!"

        conn.commit()

    await update.message.reply_text(msg)


async def stop_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id

    with engine.connect() as conn:
        conn.execute(
            text("DELETE FROM tg_wallets WHERE user_id = :user_id"),
            {"user_id": user_id},
        )
        conn.commit()

    await update.message.reply_text("You have been removed from the airdrop list.")


async def balance_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    from web3 import Web3

    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    contract = w3.eth.contract(address=Web3.to_checksum_address(TOKEN_ADDRESS), abi=TOKEN_ABI)

    user_id = update.effective_user.id
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT address FROM tg_wallets WHERE user_id = :user_id"),
            {"user_id": user_id},
        ).fetchone()

    if not result:
        await update.message.reply_text("You are not registered. Use /set_wallet <address>.")
        return

    address = result[0]
    balance = contract.functions.balanceOf(Web3.to_checksum_address(address)).call()
    decimals = 18
    balance_tg = balance / (10**decimals)

    await update.message.reply_text(f"Balance {address[:6]}...{address[-4:]}: {balance_tg} TG")


async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    logger.error(f"Update {update} caused error {context.error}")


def run_dispatcher():
    builder = Application.builder().token(TELEGRAM_BOT_TOKEN)

    if HTTP_PROXY:
        proxy_url = HTTP_PROXY
        if proxy_url.startswith("http://") or proxy_url.startswith("socks5://"):
            builder = builder.request(
                HTTPXRequest(
                    connection_pool_size=10,
                    proxy=proxy_url,
                )
            )
        else:
            logger.warning(f"Unsupported proxy format: {proxy_url}, ignoring")

    application = builder.build()

    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("set_wallet", set_wallet_command))
    application.add_handler(CommandHandler("stop", stop_command))
    application.add_handler(CommandHandler("balance", balance_command))

    application.add_error_handler(error_handler)

    logger.info("Bot started, polling...")
    application.run_polling(allowed_updates=["message"])


if __name__ == "__main__":
    run_dispatcher()