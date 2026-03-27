FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    # git \
    # unzip \
    python3 \
    python3-pip \
    python-is-python3 \
    # tmux \
    xvfb \
    xauth \
    libgl1-mesa-dev \
    libgles2-mesa-dev \
    libosmesa6-dev \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libxi-dev \
    libxinerama-dev \
    libxrandr-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json .
RUN npm install

# Fix: 1.21.x chat packet 'checksum' field is i8 but receives unsigned byte values
COPY patch_protocol.py .
RUN python3 patch_protocol.py

COPY . .

CMD ["npm", "start"]