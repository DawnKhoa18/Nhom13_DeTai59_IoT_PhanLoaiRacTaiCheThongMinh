FROM node:22-alpine

WORKDIR /app

# Cài đặt dependencies
COPY server/package*.json ./
RUN npm ci --omit=dev

# Sao chép mã nguồn backend
COPY server/ ./

# Tạo thư mục dữ liệu SQLite
RUN mkdir -p /app/data

ENV PORT=3000
ENV NODE_ENV=production
ENV DB_PATH=/app/data/smart_recycling.db

EXPOSE 3000

CMD ["node", "index.js"]
