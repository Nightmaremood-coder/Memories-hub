FROM node:20-alpine AS builder
# sharp needs vips-dev + build tools to compile its native bindings on Alpine (musl)
RUN apk add --no-cache python3 make g++ vips-dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
# Build production node_modules in the same stage (vips-dev available for sharp)
RUN npm ci --omit=dev

FROM node:20-alpine
# ffmpeg  : video transcoding + thumbnail extraction
# libraw  : RAW/DNG support — provides the dcraw_emu binary
# vips    : libvips runtime required by sharp
RUN apk add --no-cache ffmpeg libraw vips
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist/
CMD ["node", "dist/worker.js"]
