# Build stage
FROM node:18-alpine AS build

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:24-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install all dependencies (not just production)
RUN npm ci

# Copy the build output from the build stage
COPY --from=build /app/build ./build

# Copy the server.js file
COPY --from=build /app/server.js ./

# Expose ports for both React and Express
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/ || exit 1

# Start both React and Express servers
CMD ["npm", "start"]
