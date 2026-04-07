FROM node:24-bookworm-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
WORKDIR /repo
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx next build apps/web-app

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /repo/apps/web-app/.next/standalone ./
COPY --from=builder /repo/apps/web-app/.next/static ./apps/web-app/.next/static
COPY --from=builder /repo/apps/web-app/public ./apps/web-app/public
COPY --from=builder /repo/apps/web-app/telemetry ./apps/web-app/telemetry

WORKDIR /app/apps/web-app
USER node

EXPOSE 3000

CMD ["node", "-r", "./telemetry/register-azure-monitor.cjs", "server.js"]
