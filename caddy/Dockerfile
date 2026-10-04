FROM caddy:latest

WORKDIR /app

COPY Caddyfile ./

COPY --chmod=755 entrypoint.sh ./

# Strip CRLF from Windows checkouts.
RUN sed -i 's/\r$//' entrypoint.sh

RUN caddy fmt --overwrite Caddyfile

ENTRYPOINT ["/bin/sh"]

CMD ["entrypoint.sh"]