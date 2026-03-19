FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Expose ports for dev server and backend
EXPOSE 4000 5174

# Start the dev server and backend via concurrently
CMD ["npm", "run", "dev"]
