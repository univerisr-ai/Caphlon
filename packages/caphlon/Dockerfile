FROM node:22-alpine AS build

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/bin ./bin
COPY --from=build /app/package.json ./

ENV NODE_ENV=production
ENTRYPOINT ["node", "bin/caphlon.js"]
CMD ["--help"]
