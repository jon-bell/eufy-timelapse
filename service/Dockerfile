FROM node:16-buster-slim
RUN mkdir -p /usr/src/app
RUN apt-get update
RUN apt-get install -y ffmpeg moreutils libvips-tools
RUN apt-get clean

WORKDIR /usr/src/app

COPY service/package*.json /usr/src/app/
RUN npm install 
COPY service/ /usr/src/app
ENV NODE_ENV production
ENV PORT 80
EXPOSE 80
CMD npx ts-node src/main.ts | ts
