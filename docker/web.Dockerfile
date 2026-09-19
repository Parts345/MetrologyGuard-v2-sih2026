FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm install --workspace=@metrologyguard/web
COPY apps/web apps/web
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build --workspace=@metrologyguard/web

FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
