FROM nginx:alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy custom nginx configuration
COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy web files
COPY web /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
