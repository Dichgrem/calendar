FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @calendar/web build

FROM base AS prod
RUN apk add --no-cache dumb-init

WORKDIR /app

RUN mkdir -p packages/server packages/shared
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/package.json ./

RUN pnpm install --filter @calendar/server --prod --frozen-lockfile

COPY --from=builder /app/packages/server/src packages/server/src
COPY --from=builder /app/packages/shared/src packages/shared/src
COPY --from=builder /app/packages/shared/tsconfig.json packages/shared/
COPY --from=builder /app/packages/server/drizzle packages/server/drizzle
COPY --from=builder /app/packages/web/dist packages/server/public

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

WORKDIR /app/packages/server
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--import", "tsx/esm", "src/index.ts"]
