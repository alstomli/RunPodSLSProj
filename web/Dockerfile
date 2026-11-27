# The web app as one long-running Node server (Next.js standalone output) on port 3000.
# The image holds no secrets and no project-specific values: every setting is read from
# environment variables when the server starts (see README.md). Build from this folder:
#   docker build -t runpodslsproj-web .

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `public/` is optional; make sure it exists so the copy below always works.
RUN npm run build && mkdir -p public

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# server.js and only the node_modules files it needs, plus the static files it serves.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
