FROM ubuntu:22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Install base tools and development dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    vim \
    nano \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    nodejs \
    npm \
    jq \
    tree \
    htop \
    net-tools \
    iputils-ping \
    dnsutils \
    unzip \
    zip \
    ca-certificates \
    gnupg \
    lsb-release \
    sudo \
    locales \
    && rm -rf /var/lib/apt/lists/*

# Set locale
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

# Install Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install common Python packages
RUN pip3 install --no-cache-dir \
    requests \
    flask \
    fastapi \
    uvicorn \
    pandas \
    numpy \
    matplotlib \
    pytest

# Install common Node.js packages globally
RUN npm install -g \
    typescript \
    ts-node \
    nodemon \
    http-server \
    create-react-app \
    express

# Install Chromium for browser automation
RUN apt-get update && apt-get install -y \
    chromium-browser \
    chromium-chromedriver \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Create sandbox user (non-root)
RUN useradd -m -s /bin/bash sandbox \
    && echo "sandbox ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/pip3, /usr/bin/npm, /usr/bin/npx" >> /etc/sudoers

# Set up sandbox user environment
USER sandbox
WORKDIR /home/sandbox

# Create default project directory
RUN mkdir -p /home/sandbox/project

# Copy entrypoint
COPY --chown=sandbox:sandbox entrypoint.sh /home/sandbox/entrypoint.sh
RUN chmod +x /home/sandbox/entrypoint.sh

# Default port for preview servers
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["/home/sandbox/entrypoint.sh"]