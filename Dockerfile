FROM denoland/deno:latest AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential python3 && rm -rf /var/lib/apt/lists/*

COPY package.json deno.lock* deno.json* vite.config.ts .svelte-kit/tsconfig.json ./

RUN deno install

COPY . .

ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://postgres:password@localhost:5432/forge"
RUN deno x prisma generate
RUN deno task build

FROM denoland/deno:latest AS runner

RUN apt-get update && apt-get install -y --no-install-recommends curl git ca-certificates && update-ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/deno.lock* ./
COPY --from=builder /app/deno.json* ./

RUN deno install

EXPOSE 3000

CMD ["sh", "-c", "deno x prisma migrate deploy && deno run --allow-net --allow-env --allow-read --allow-sys build/index.js"]
