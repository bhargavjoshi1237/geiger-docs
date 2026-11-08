# Geiger Docs signing service on Render: the official, unmodified Documenso image plus a boot script.
# The script only sets env and a signing certificate, then execs the image's own entrypoint and CMD (see entrypoint.sh, README.md).
# Upgrade by bumping this tag only; never patch or rebuild Documenso itself.
FROM documenso/documenso:v2.21.1

# Root only for setup; the image already ships openssl (Alpine), so apk runs only if a future tag drops it
USER root
# Build context is the repo root (Render's default for a plain web service and the Blueprint alike)
COPY deploy/documenso/render/entrypoint.sh /opt/geiger/render-entrypoint.sh
RUN { command -v openssl >/dev/null 2>&1 || apk add --no-cache openssl; } \
    && sed -i 's/\r$//' /opt/geiger/render-entrypoint.sh \
    && chmod 0555 /opt/geiger/render-entrypoint.sh \
    && mkdir -p /opt/documenso \
    && chown nodejs:nodejs /opt/documenso

# Back to the image's own user (nodejs, uid 1001) and working directory
USER nodejs
WORKDIR /app/apps/remix

# Upstream is ENTRYPOINT ["docker-entrypoint.sh"] + CMD ["sh", "start.sh"]; the script ends with: exec docker-entrypoint.sh "$@"
ENTRYPOINT ["/bin/sh", "/opt/geiger/render-entrypoint.sh"]
CMD ["sh", "start.sh"]
