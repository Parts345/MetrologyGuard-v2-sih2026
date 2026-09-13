FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm install --workspace=@metrologyguard/api
COPY apps/api apps/api
RUN npm run build --workspace=@metrologyguard/api

FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm install --omit=dev --workspace=@metrologyguard/api
COPY --from=build /app/apps/api/dist apps/api/dist
CMD ["node", "apps/api/dist/server.js"]
