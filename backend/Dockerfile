# ParkSpotZ API image, for Google Cloud Run.
# Build for Cloud Run's platform:
#   docker build --platform linux/amd64 -t <IMAGE> backend

# --- build stage: compile TypeScript ---------------------------------------
FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage: production dependencies and compiled code only ----------
FROM node:24-slim
ENV NODE_ENV=production
# Cloud Run sets PORT itself; 8080 is the default when run elsewhere.
ENV PORT=8080
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# The schema, so `node dist/scripts/db-setup.js` can be run from the image too.
COPY schema.sql ./
# Entry photos go to UPLOADS_DIR. On Cloud Run that is a mounted Cloud Storage
# bucket; this folder is only the fallback when nothing is mounted.
RUN mkdir -p /app/uploads && chown node:node /app/uploads
# Do not run as root.
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
