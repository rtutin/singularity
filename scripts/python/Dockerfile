FROM python:3.12-slim

WORKDIR /app

COPY . .

RUN pip install python-telegram-bot web3 sqlalchemy python-dotenv

CMD ["python", "telegram_airdrop_bot.py"]