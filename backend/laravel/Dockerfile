FROM php:8.4-cli

RUN docker-php-ext-install bcmath
RUN apt-get update && apt-get install -y libgmp-dev \
    && docker-php-ext-install gmp

WORKDIR /var/www/html