# ---------------------------------------------------------------------------
# Stage 1 – Install production dependencies (cached by layer unless
# package.json / package-lock.json changes)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

# Copy dependency manifests first — Docker caches this layer independently
# of source-code changes, so npm install only re-runs when deps change.
COPY package.json package-lock.json* ./

# Install ONLY production dependencies (no devDependencies needed in final
# image). npm ci is faster and stricter than npm install in CI/Docker.
RUN npm ci --omit=dev && npm cache clean --force

# ---------------------------------------------------------------------------
# Stage 2 – Build / dev stage (optional, used when devDependencies are
# wanted, e.g. for running tests)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# ---------------------------------------------------------------------------
# Stage 3 – Production image (tiny, only what's needed at runtime)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS production

# Install curl for Docker healthchecks (remains small on Alpine)
RUN apk add --no-cache curl

# Good practice: run as a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy the pruned node_modules from the deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy only the source code (no Dockerfiles, no README, etc.)
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./

USER appuser

EXPOSE 3000

# Healthcheck so orchestrators can detect when the bot is unresponsive
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl --fail http://localhost:3000/ || exit 1

CMD ["node", "src/index.js"]
