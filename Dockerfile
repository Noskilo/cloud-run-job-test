FROM --platform=linux/amd64 node:hydrogen-buster as builder

WORKDIR /usr/src/app/
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM --platform=linux/amd64 node:hydrogen-buster

WORKDIR /cloud-run-job-test/dist
COPY --from=builder /usr/src/app/package*.json ./
RUN npm install --production
COPY --from=builder /usr/src/app/dist ./dist
CMD ["npm","run", "start:prod"]
