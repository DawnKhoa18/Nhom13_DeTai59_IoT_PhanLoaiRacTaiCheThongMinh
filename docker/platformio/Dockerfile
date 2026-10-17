FROM python:3.11-slim

# Install git and tools required by PlatformIO package manager
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install PlatformIO Core
RUN pip install --no-cache-dir -U platformio

WORKDIR /workspace

ENTRYPOINT ["pio"]
CMD ["run"]
