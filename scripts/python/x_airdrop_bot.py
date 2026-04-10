import os
import logging
from datetime import datetime
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes
from sqlalchemy import create_engine, text

logging.basicConfig(format="%(asctime)s - %(levelname)s - %(message)s", level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("telegram").setLevel(logging.WARNING)

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
if not TELEGRAM_BOT_TOKEN:
    raise ValueError("TELEGRAM_BOT_TOKEN not set")

DB_PATH = os.environ.get("DB_PATH", "/home/lain/random/singularity/backend/laravel/database/database.sqlite")

TWITTER_USERNAME = os.environ.get("TWITTER_USERNAME", "your_twitter_username")
X_TOKEN_ADDRESS = "0x14207CfF0880067B676B38cd17Ba7B002eeE8672"

TOKEN_ABI = [
    {"inputs": [{"name": "to", "type": "address"}, {"name": "amount", "type": "uint256"}], "name": "mint", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
    {"inputs": [{"name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"},
]

RPC_URL = "http://195.166.164.94:8545"
CHAIN_ID = 49406

logger = logging.getLogger(__name__)
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        f"Hi! To receive X tokens, tweet this:\n\n"
        f"@{TWITTER_USERNAME} $X @your_telegram_username 0xaddress\n\n"
        f"Then I'll verify your follow and mint 1 X per hour!"
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Commands:\n"
        "/start - start receiving X\n"
        "/check - verify tweet and get X\n"
        "/balance - check X balance"
    )


async def check_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    from web3 import Web3

    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    contract = w3.eth.contract(address=Web3.to_checksum_address(X_TOKEN_ADDRESS), abi=TOKEN_ABI)

    with engine.connect() as conn:
        result = conn.execute(text("SELECT address FROM tg_wallets WHERE user_id = :user_id"), {"user_id": user_id}).fetchone()

    if result:
        address = result[0]
        balance = contract.functions.balanceOf(Web3.to_checksum_address(address)).call()
        await update.message.reply_text(f"Balance {address[:6]}...{address[-4:]}: {balance // 10**18} X")
    else:
        await update.message.reply_text("No wallet found. Use /set_wallet in the TG bot.")


async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    logger.error(f"Error: {context.error}")


def run_bot():
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("check", check_command))
    application.add_handler(CommandHandler("balance", check_command))
    application.add_error_handler(error_handler)
    logger.info("X Bot started")
    application.run_polling(allowed_updates=["message"])


if __name__ == "__main__":
    run_bot()